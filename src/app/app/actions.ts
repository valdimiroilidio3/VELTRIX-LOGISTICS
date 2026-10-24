"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { AppError, logError } from "@/lib/errors";
import { createShipment, transitionShipment, assignShipment, submitProofOfDelivery, updateStopStatus } from "@/lib/domain/shipments";
import { createCustomer, createUser, setUserStatus, updateCustomerStatus } from "@/lib/domain/people";
import { createRoute, optimizeRoute, updateRouteStatus } from "@/lib/domain/routes";
import { recordInventoryMovement, setZoneOccupancy } from "@/lib/domain/warehouse";
import { createInvoice, registerPayment, updateQuoteStatus } from "@/lib/domain/commercial";
import { processNotificationQueue } from "@/lib/notifications";
import { decodeUpload, savePrivateFile } from "@/lib/storage";
import { createShipmentSchema, podSchema, routeSchema, invoiceSchema, inventoryMovementSchema } from "@/lib/validation/schemas";
import { SHIPMENT_STATUSES } from "@/lib/domain/shipment-status";
import type { Permission } from "@/lib/auth/rbac";

export interface ActionResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

function toResult(error: unknown, fallback: string): ActionResult {
  if (error instanceof AppError) return { ok: false, message: error.message };
  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    return { ok: false, message: first ? `${first.path.join(".")}: ${first.message}` : "Dados inválidos" };
  }
  logError("action", error);
  return { ok: false, message: fallback };
}

async function clientIp(): Promise<string> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

async function guard(permission: Permission) {
  return requirePermission(permission);
}

/* --------------------------------------------------------------- shipments */

export async function createShipmentAction(formData: FormData): Promise<ActionResult> {
  try {
    // Staff need shipments:create; customer portal accounts need shipments:request.
    const user = await requirePermission("shipments:read");
    if (!user.permissions.includes("shipments:create") && !user.permissions.includes("shipments:request")) {
      throw new AppError("Sem permissão para criar pedidos.", 403, "forbidden");
    }
    const items = JSON.parse(String(formData.get("items") ?? "[]")) as unknown;
    const payload = {
      customerId: formData.get("customerId"),
      serviceType: formData.get("serviceType"),
      priority: formData.get("priority") ?? "normal",
      requestedPickupAt: formData.get("requestedPickupAt") || undefined,
      estimatedDeliveryAt: formData.get("estimatedDeliveryAt") || undefined,
      notes: formData.get("notes") ?? "",
      quotedAmountCents: Math.round(Number(formData.get("quotedAmount") ?? 0) * 100),
      items,
      origin: {
        label: "Origem",
        addressLine: formData.get("originAddressLine"),
        postalCode: formData.get("originPostalCode") ?? "",
        city: formData.get("originCity"),
        countryCode: formData.get("originCountryCode") ?? "PT",
        latitude: formData.get("originLatitude") ? Number(formData.get("originLatitude")) : undefined,
        longitude: formData.get("originLongitude") ? Number(formData.get("originLongitude")) : undefined,
      },
      destination: {
        label: "Destino",
        addressLine: formData.get("destinationAddressLine"),
        postalCode: formData.get("destinationPostalCode") ?? "",
        city: formData.get("destinationCity"),
        countryCode: formData.get("destinationCountryCode") ?? "PT",
        latitude: formData.get("destinationLatitude") ? Number(formData.get("destinationLatitude")) : undefined,
        longitude: formData.get("destinationLongitude") ? Number(formData.get("destinationLongitude")) : undefined,
      },
      idempotencyKey: formData.get("idempotencyKey") || undefined,
    };
    const parsed = createShipmentSchema.parse(payload);
    const result = await createShipment(parsed, user, { ip: await clientIp() });
    revalidatePath("/app/shipments");
    revalidatePath("/app");
    return {
      ok: true,
      message:
        user.role === "customer"
          ? `Pedido ${result.trackingCode} registado. A equipa comercial enviará o orçamento.`
          : `Encomenda ${result.trackingCode} criada`,
      data: result,
    };
  } catch (error) {
    return toResult(error, "Não foi possível criar a encomenda");
  }
}

export async function transitionAction(input: {
  shipmentId: string;
  toStatus: string;
  description?: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  override?: boolean;
  justification?: string;
}): Promise<ActionResult> {
  try {
    const user = await guard("shipments:transition");
    if (!(SHIPMENT_STATUSES as readonly string[]).includes(input.toStatus)) {
      return { ok: false, message: "Estado inválido" };
    }
    const result = await transitionShipment(
      { ...input, toStatus: input.toStatus as (typeof SHIPMENT_STATUSES)[number] },
      user,
      { ip: await clientIp() },
    );
    revalidatePath(`/app/shipments/${input.shipmentId}`);
    revalidatePath("/app/shipments");
    revalidatePath("/app");
    return { ok: true, message: `Estado atualizado para ${input.toStatus}`, data: result };
  } catch (error) {
    return toResult(error, "Não foi possível alterar o estado");
  }
}

export async function assignAction(input: { shipmentId: string; driverId: string; vehicleId?: string | null }): Promise<ActionResult> {
  try {
    const user = await guard("shipments:assign");
    const result = await assignShipment(input.shipmentId, { driverId: input.driverId, vehicleId: input.vehicleId ?? null }, user, {
      ip: await clientIp(),
    });
    revalidatePath(`/app/shipments/${input.shipmentId}`);
    revalidatePath("/app/routes");
    return { ok: true, message: "Encomenda atribuída ao motorista", data: result };
  } catch (error) {
    return toResult(error, "Não foi possível atribuir a encomenda");
  }
}

export async function podAction(input: {
  shipmentId: string;
  receivedBy: string;
  notes?: string;
  latitude?: number | null;
  longitude?: number | null;
  signatureDataUrl?: string;
  photos?: string[];
}): Promise<ActionResult> {
  try {
    const user = await guard("pod:submit");
    const parsed = podSchema.parse({
      receivedBy: input.receivedBy,
      notes: input.notes ?? "",
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      signatureDataUrl: input.signatureDataUrl || undefined,
      photos: input.photos ?? [],
    });

    let signaturePath: string | null = null;
    if (parsed.signatureDataUrl) {
      const { buffer } = decodeUpload(parsed.signatureDataUrl, "image/png");
      signaturePath = await savePrivateFile(user.organizationId, "signatures", buffer, "png");
    }
    const photoPaths: string[] = [];
    for (const photo of parsed.photos ?? []) {
      const mime = photo.startsWith("data:image/png") ? "image/png" : photo.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
      const { buffer, extension } = decodeUpload(photo, mime);
      photoPaths.push(await savePrivateFile(user.organizationId, "pod-photos", buffer, extension));
    }

    await submitProofOfDelivery(
      input.shipmentId,
      {
        receivedBy: parsed.receivedBy,
        notes: parsed.notes || undefined,
        latitude: parsed.latitude ?? null,
        longitude: parsed.longitude ?? null,
        signaturePath,
        photoPaths,
      },
      user,
      { ip: await clientIp() },
    );
    revalidatePath(`/app/shipments/${input.shipmentId}`);
    revalidatePath("/app/driver");
    revalidatePath("/app");
    return { ok: true, message: "Prova de entrega registada e entrega confirmada" };
  } catch (error) {
    return toResult(error, "Não foi possível registar a prova de entrega");
  }
}

export async function stopStatusAction(input: { stopId: string; status: "en_route" | "arrived" | "completed" | "failed" }): Promise<ActionResult> {
  try {
    const user = await guard("tasks:read_own");
    await updateStopStatus(input.stopId, input.status, user);
    revalidatePath("/app/driver");
    return { ok: true, message: "Paragem atualizada" };
  } catch (error) {
    return toResult(error, "Não foi possível atualizar a paragem");
  }
}

/* --------------------------------------------------------------- customers */

export async function createCustomerAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await guard("customers:write");
    const { customerSchema } = await import("@/lib/validation/schemas");
    const parsed = customerSchema.parse({
      customerType: formData.get("customerType"),
      companyName: formData.get("companyName") ?? "",
      contactName: formData.get("contactName"),
      email: formData.get("email"),
      phone: formData.get("phone") ?? "",
      taxNumber: formData.get("taxNumber") ?? "",
      billingAddress: formData.get("billingAddress") ?? "",
      billingPostalCode: formData.get("billingPostalCode") ?? "",
      billingCity: formData.get("billingCity") ?? "",
      billingCountryCode: formData.get("billingCountryCode") ?? "PT",
      notes: formData.get("notes") ?? "",
    });
    const result = await createCustomer(user.organizationId, parsed, user);
    revalidatePath("/app/customers");
    return { ok: true, message: "Cliente criado", data: result };
  } catch (error) {
    return toResult(error, "Não foi possível criar o cliente");
  }
}

export async function customerStatusAction(input: { customerId: string; status: "active" | "inactive" | "blocked" }): Promise<ActionResult> {
  try {
    const user = await guard("customers:write");
    await updateCustomerStatus(user.organizationId, input.customerId, input.status, user);
    revalidatePath("/app/customers");
    return { ok: true, message: "Estado do cliente atualizado" };
  } catch (error) {
    return toResult(error, "Não foi possível atualizar o cliente");
  }
}

/* ------------------------------------------------------------------ routes */

export async function createRouteAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await guard("routes:write");
    const shipmentIds = formData.getAll("shipmentIds").map(String);
    const parsed = routeSchema.parse({
      routeDate: formData.get("routeDate"),
      name: formData.get("name") ?? "",
      driverId: formData.get("driverId") || null,
      vehicleId: formData.get("vehicleId") || null,
      shipmentIds,
    });
    const result = await createRoute(
      {
        routeDate: parsed.routeDate,
        name: parsed.name || undefined,
        driverId: parsed.driverId ?? null,
        vehicleId: parsed.vehicleId ?? null,
        shipmentIds: parsed.shipmentIds,
      },
      user,
    );
    revalidatePath("/app/routes");
    return { ok: true, message: `Rota criada com ${result.stops} paragens`, data: result };
  } catch (error) {
    return toResult(error, "Não foi possível criar a rota");
  }
}

export async function optimizeRouteAction(routeId: string): Promise<ActionResult> {
  try {
    const user = await guard("routes:optimize");
    const result = await optimizeRoute(routeId, user);
    revalidatePath(`/app/routes/${routeId}`);
    revalidatePath("/app/routes");
    return {
      ok: true,
      message: result.estimated
        ? `Sequência recalculada (${result.distanceKm} km estimados em linha reta — motor de rotas não configurado)`
        : `Rota calculada: ${result.distanceKm} km · ${result.durationMin} min (${result.provider})`,
      data: result,
    };
  } catch (error) {
    return toResult(error, "Não foi possível recalcular a rota");
  }
}

export async function routeStatusAction(input: { routeId: string; status: string }): Promise<ActionResult> {
  try {
    const user = await guard("routes:write");
    await updateRouteStatus(input.routeId, input.status, user);
    revalidatePath(`/app/routes/${input.routeId}`);
    revalidatePath("/app/routes");
    return { ok: true, message: "Estado da rota atualizado" };
  } catch (error) {
    return toResult(error, "Não foi possível atualizar a rota");
  }
}

/* --------------------------------------------------------------- warehouse */

export async function inventoryMovementAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await guard("inventory:write");
    const parsed = inventoryMovementSchema.parse({
      warehouseId: formData.get("warehouseId"),
      zoneId: formData.get("zoneId") || null,
      inventoryItemId: formData.get("inventoryItemId"),
      shipmentId: formData.get("shipmentId") || null,
      movementType: formData.get("movementType"),
      quantity: formData.get("quantity"),
      reference: formData.get("reference") ?? "",
    });
    const result = await recordInventoryMovement(
      {
        warehouseId: parsed.warehouseId,
        zoneId: parsed.zoneId ?? null,
        inventoryItemId: parsed.inventoryItemId,
        shipmentId: parsed.shipmentId ?? null,
        movementType: parsed.movementType,
        quantity: parsed.quantity,
        reference: parsed.reference || undefined,
      },
      user,
    );
    revalidatePath("/app/warehouse");
    return { ok: true, message: `Movimento registado · stock ${result.onHand} (${result.sku})`, data: result };
  } catch (error) {
    return toResult(error, "Não foi possível registar o movimento");
  }
}

export async function zoneOccupancyAction(input: { zoneId: string; occupiedPallets: number; reason: string }): Promise<ActionResult> {
  try {
    const user = await guard("warehouse:write");
    await setZoneOccupancy(input.zoneId, input.occupiedPallets, user, input.reason);
    revalidatePath("/app/warehouse");
    revalidatePath("/app/facility");
    return { ok: true, message: "Ocupação atualizada e auditada" };
  } catch (error) {
    return toResult(error, "Não foi possível atualizar a ocupação");
  }
}

/* ---------------------------------------------------------------- finance */

export async function invoiceAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await guard("invoices:write");
    const parsed = invoiceSchema.parse({
      customerId: formData.get("customerId"),
      shipmentId: formData.get("shipmentId") || null,
      subtotalCents: Math.round(Number(formData.get("subtotal") ?? 0) * 100),
      vatRatePct: formData.get("vatRatePct") ?? 23,
      dueInDays: formData.get("dueInDays") ?? 30,
    });
    const result = await createInvoice(user.organizationId, parsed, user);
    revalidatePath("/app/invoices");
    return { ok: true, message: `Fatura ${result.invoiceNumber} emitida`, data: result };
  } catch (error) {
    return toResult(error, "Não foi possível emitir a fatura");
  }
}

export async function paymentAction(input: { invoiceId: string; amountCents: number; reference?: string }): Promise<ActionResult> {
  try {
    const user = await guard("payments:write");
    const result = await registerPayment(
      user.organizationId,
      { invoiceId: input.invoiceId, amountCents: input.amountCents, provider: "manual", reference: input.reference },
      user,
    );
    revalidatePath("/app/invoices");
    return { ok: true, message: result.settled ? "Fatura liquidada" : "Pagamento parcial registado" };
  } catch (error) {
    return toResult(error, "Não foi possível registar o pagamento");
  }
}

export async function quoteStatusAction(input: { quoteId: string; status: "draft" | "sent" | "accepted" | "rejected" | "expired" }): Promise<ActionResult> {
  try {
    const user = await guard("quotes:write");
    await updateQuoteStatus(user.organizationId, input.quoteId, input.status, user);
    revalidatePath("/app/quotes");
    return { ok: true, message: "Orçamento atualizado" };
  } catch (error) {
    return toResult(error, "Não foi possível atualizar o orçamento");
  }
}

/* ------------------------------------------------------------------ users */

export async function createUserAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await guard("users:manage");
    const { userCreateSchema } = await import("@/lib/validation/schemas");
    const parsed = userCreateSchema.parse({
      email: formData.get("email"),
      fullName: formData.get("fullName"),
      role: formData.get("role"),
      password: formData.get("password"),
      customerId: formData.get("customerId") || null,
      phone: formData.get("phone") ?? "",
    });
    await createUser(user.organizationId, parsed, user);
    revalidatePath("/app/users");
    return { ok: true, message: "Utilizador criado" };
  } catch (error) {
    return toResult(error, "Não foi possível criar o utilizador");
  }
}

export async function userStatusAction(input: { profileId: string; status: "active" | "suspended" }): Promise<ActionResult> {
  try {
    const user = await guard("users:manage");
    await setUserStatus(user.organizationId, input.profileId, input.status, user);
    revalidatePath("/app/users");
    return { ok: true, message: input.status === "suspended" ? "Acesso revogado e sessões encerradas" : "Acesso reativado" };
  } catch (error) {
    return toResult(error, "Não foi possível atualizar o utilizador");
  }
}

export async function processNotificationsAction(): Promise<ActionResult> {
  try {
    await guard("settings:manage" as Permission).catch(() => guard("settings:read"));
    const result = await processNotificationQueue(25);
    revalidatePath("/app/integrations");
    return {
      ok: true,
      message: `Fila processada: ${result.processed} jobs, ${result.sent} enviados, ${result.failed} falhados, ${result.skipped} sem fornecedor`,
      data: { ...result },
    };
  } catch (error) {
    return toResult(error, "Não foi possível processar a fila de notificações");
  }
}

/* --------------------------------------------------------------- settings */

export async function organizationSettingsAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await guard("settings:write");
    const { updateOrganizationSettings } = await import("@/lib/domain/settings");
    await updateOrganizationSettings(
      user.organizationId,
      {
        name: String(formData.get("name") ?? ""),
        legalName: formData.get("legalName") ? String(formData.get("legalName")) : null,
        taxNumber: formData.get("taxNumber") ? String(formData.get("taxNumber")) : null,
        timezone: String(formData.get("timezone") ?? user.timezone),
        defaultCurrency: String(formData.get("defaultCurrency") ?? user.currency),
      },
      user,
    );
    revalidatePath("/app/settings");
    revalidatePath("/app");
    return { ok: true, message: "Configuração da organização atualizada" };
  } catch (error) {
    return toResult(error, "Não foi possível atualizar a organização");
  }
}

export async function pricingRuleAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await guard("settings:write");
    const { updatePricingRule } = await import("@/lib/domain/settings");
    const toCents = (value: FormDataEntryValue | null) => {
      const parsed = Number(value ?? 0);
      if (!Number.isFinite(parsed)) throw new AppError("Valor monetário inválido", 422, "validation_error");
      return Math.round(parsed * 100);
    };
    await updatePricingRule(
      user.organizationId,
      String(formData.get("ruleId") ?? ""),
      {
        baseFeeCents: toCents(formData.get("baseFee")),
        perKgCents: toCents(formData.get("perKg")),
        perM3Cents: toCents(formData.get("perM3")),
        perKmCents: toCents(formData.get("perKm")),
        minimumCents: toCents(formData.get("minimum")),
        fuelSurchargePct: Number(formData.get("fuelSurcharge") ?? 0),
        vatRatePct: Number(formData.get("vatRate") ?? 0),
        active: String(formData.get("active")) === "true",
      },
      user,
    );
    revalidatePath("/app/settings");
    return { ok: true, message: "Tabela de preços atualizada e auditada" };
  } catch (error) {
    return toResult(error, "Não foi possível atualizar a tabela de preços");
  }
}

export async function dataModeAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await guard("settings:write");
    const { setDataMode } = await import("@/lib/domain/settings");
    const mode = formData.get("mode") === "live" ? "live" : "demo";
    const result = await setDataMode(user.organizationId, mode, String(formData.get("confirmation") ?? ""), user);
    revalidatePath("/app/settings");
    revalidatePath("/app");
    return {
      ok: true,
      message:
        mode === "live"
          ? `Modo operacional ativado. ${result.existingShipments} encomendas existentes permanecem na base de dados.`
          : "Modo demonstração ativado",
    };
  } catch (error) {
    return toResult(error, "Não foi possível alterar o modo de dados");
  }
}

/* ----------------------------------------------------------------- quotes */

export async function createQuoteAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await guard("quotes:write");
    const { createAdminQuote } = await import("@/lib/domain/quotes");
    const amount = Number(formData.get("amount"));
    if (!Number.isFinite(amount) || amount < 0) throw new AppError("Valor inválido.", 422, "validation_error");
    const validUntil = String(formData.get("validUntil") ?? "");
    const result = await createAdminQuote(
      user.organizationId,
      {
        shipmentId: String(formData.get("shipmentId") ?? "") || null,
        amountCents: Math.round(amount * 100),
        currency: String(formData.get("currency") ?? user.currency),
        taxRatePct: Number(formData.get("taxRatePct") ?? 0),
        description: String(formData.get("description") ?? "") || null,
        notes: String(formData.get("notes") ?? "") || null,
        validUntil: /^\d{4}-\d{2}-\d{2}$/.test(validUntil) ? `${validUntil}T23:59:59.000Z` : null,
      },
      user,
    );
    revalidatePath("/app/quotes");
    revalidatePath(`/app/shipments/${String(formData.get("shipmentId") ?? "")}`);
    return { ok: true, message: `Orçamento ${result.reference} criado em rascunho`, data: result };
  } catch (error) {
    return toResult(error, "Não foi possível criar o orçamento");
  }
}

export async function updateQuoteAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await guard("quotes:write");
    const { updateAdminQuote } = await import("@/lib/domain/quotes");
    const quoteId = String(formData.get("quoteId") ?? "");
    const amount = Number(formData.get("amount"));
    const validUntil = String(formData.get("validUntil") ?? "");
    await updateAdminQuote(
      user.organizationId,
      quoteId,
      {
        amountCents: Number.isFinite(amount) ? Math.round(amount * 100) : undefined,
        taxRatePct: Number.isFinite(Number(formData.get("taxRatePct"))) ? Number(formData.get("taxRatePct")) : undefined,
        currency: String(formData.get("currency") ?? ""),
        description: String(formData.get("description") ?? "") || null,
        notes: String(formData.get("notes") ?? "") || null,
        validUntil: /^\d{4}-\d{2}-\d{2}$/.test(validUntil) ? `${validUntil}T23:59:59.000Z` : null,
      },
      user,
    );
    revalidatePath("/app/quotes");
    revalidatePath(`/app/shipments/${String(formData.get("shipmentId") ?? "")}`);
    return { ok: true, message: "Orçamento atualizado" };
  } catch (error) {
    return toResult(error, "Não foi possível atualizar o orçamento");
  }
}

export async function quoteTransitionAction(input: {
  quoteId: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  notes?: string;
}): Promise<ActionResult> {
  try {
    const user = await guard("quotes:write");
    const { setAdminQuoteStatus, QUOTE_STATUS_LABELS } = await import("@/lib/domain/quotes");
    const result = await setAdminQuoteStatus(user.organizationId, input.quoteId, input.status, user, input.notes ?? null);
    revalidatePath("/app/quotes");
    revalidatePath("/app/shipments");
    return { ok: true, message: `Orçamento ${result.reference}: ${QUOTE_STATUS_LABELS[input.status].toLowerCase()}` };
  } catch (error) {
    return toResult(error, "Não foi possível alterar o orçamento");
  }
}

/* ------------------------------------------------------------ credentials */

export async function adminPasswordResetAction(input: { profileId: string }): Promise<ActionResult> {
  try {
    const user = await guard("users:manage");
    const { issueOneTimePassword } = await import("@/lib/auth/password-reset");
    const { password } = await issueOneTimePassword(user.organizationId, input.profileId, user);
    revalidatePath("/app/users");
    return {
      ok: true,
      message: password,
      data: { temporaryPassword: password },
    };
  } catch (error) {
    return toResult(error, "Não foi possível repor a palavra-passe");
  }
}

export async function updateCustomerAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await guard("customers:write");
    const { updateCustomer } = await import("@/lib/domain/people");
    const customerId = String(formData.get("customerId") ?? "");
    const email = String(formData.get("email") ?? "").trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new AppError("Email inválido.", 422, "validation_error");
    }
    await updateCustomer(
      user.organizationId,
      customerId,
      {
        companyName: String(formData.get("companyName") ?? "") || null,
        contactName: String(formData.get("contactName") ?? ""),
        email,
        phone: String(formData.get("phone") ?? ""),
        taxNumber: String(formData.get("taxNumber") ?? "") || null,
        billingAddress: String(formData.get("billingAddress") ?? "") || null,
        billingPostalCode: String(formData.get("billingPostalCode") ?? "") || null,
        billingCity: String(formData.get("billingCity") ?? "") || null,
        billingCountryCode: String(formData.get("billingCountryCode") ?? "PT"),
        notes: String(formData.get("notes") ?? "") || null,
      },
      user,
    );
    revalidatePath("/app/customers");
    return { ok: true, message: "Cliente atualizado" };
  } catch (error) {
    return toResult(error, "Não foi possível atualizar o cliente");
  }
}
