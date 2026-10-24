import { z } from "zod";
import { SHIPMENT_STATUSES } from "@/lib/domain/shipment-status";

const trimmed = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label}: mínimo ${min} caracteres`).max(max, `${label}: máximo ${max} caracteres`);

export const emailSchema = z.string().trim().toLowerCase().email("Email inválido").max(200);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Palavra-passe obrigatória").max(200),
});

export const addressSchema = z.object({
  label: trimmed(1, 80, "Etiqueta").optional().or(z.literal("")),
  addressLine: trimmed(3, 200, "Morada"),
  postalCode: z.string().trim().max(20).optional().or(z.literal("")),
  city: trimmed(2, 80, "Cidade"),
  region: z.string().trim().max(80).optional().or(z.literal("")),
  countryCode: z.string().trim().length(2, "Código de país ISO-2").toUpperCase(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export const shipmentItemSchema = z.object({
  description: trimmed(2, 200, "Descrição"),
  quantity: z.coerce.number().int().min(1).max(10_000),
  weightKg: z.coerce.number().min(0).max(50_000),
  lengthCm: z.coerce.number().min(0).max(3_000).optional(),
  widthCm: z.coerce.number().min(0).max(3_000).optional(),
  heightCm: z.coerce.number().min(0).max(3_000).optional(),
  declaredValueCents: z.coerce.number().int().min(0).optional(),
  handlingInstructions: z.string().trim().max(300).optional().or(z.literal("")),
});

export const createShipmentSchema = z.object({
  customerId: z.string().uuid("Cliente inválido"),
  origin: addressSchema,
  destination: addressSchema,
  serviceType: z.enum(["standard", "express", "same_day", "freight", "international"]),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  requestedPickupAt: z.string().datetime().optional().or(z.literal("")),
  estimatedDeliveryAt: z.string().datetime().optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  items: z.array(shipmentItemSchema).min(1, "Adicione pelo menos um artigo").max(50),
  // Omitido quando o pedido ainda não tem preço: 0 significa "a orçamentar".
  quotedAmountCents: z.coerce.number().int().min(0).optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});

export const transitionSchema = z.object({
  toStatus: z.enum(SHIPMENT_STATUSES),
  description: z.string().trim().max(500).optional(),
  location: z.string().trim().max(160).optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  override: z.boolean().optional(),
  justification: z.string().trim().max(1000).optional(),
});

export const assignSchema = z.object({
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid().nullable().optional(),
  routeId: z.string().uuid().nullable().optional(),
});

export const podSchema = z.object({
  receivedBy: trimmed(2, 120, "Receptor"),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  signatureDataUrl: z
    .string()
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Assinatura inválida")
    .max(400_000)
    .optional(),
  photos: z.array(z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Imagem inválida")).max(4).optional(),
  deliveredAt: z.string().datetime().optional(),
});

export const customerSchema = z.object({
  customerType: z.enum(["business", "individual"]),
  companyName: z.string().trim().max(160).optional().or(z.literal("")),
  contactName: trimmed(2, 120, "Contacto"),
  email: emailSchema,
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  taxNumber: z.string().trim().max(30).optional().or(z.literal("")),
  billingAddress: z.string().trim().max(200).optional().or(z.literal("")),
  billingPostalCode: z.string().trim().max(20).optional().or(z.literal("")),
  billingCity: z.string().trim().max(80).optional().or(z.literal("")),
  billingCountryCode: z.string().trim().length(2).toUpperCase().default("PT"),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const quoteRequestSchema = z.object({
  contactName: trimmed(2, 120, "Nome"),
  contactEmail: emailSchema,
  contactPhone: z.string().trim().max(40).optional().or(z.literal("")),
  origin: trimmed(2, 160, "Origem"),
  destination: trimmed(2, 160, "Destino"),
  serviceType: z.enum(["standard", "express", "same_day", "freight", "international"]),
  weightKg: z.coerce.number().min(0.1, "Peso obrigatório").max(50_000),
  volumeM3: z.coerce.number().min(0).max(500).default(0),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  website: z.string().max(0).optional(), // honeypot
});

export const quoteStatusSchema = z.object({ status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]) });

export const routeSchema = z.object({
  routeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  driverId: z.string().uuid().nullable().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  shipmentIds: z.array(z.string().uuid()).min(1, "Selecione pelo menos uma encomenda").max(25),
});

export const routeOptimizeSchema = z.object({
  startLatitude: z.coerce.number().min(-90).max(90).optional(),
  startLongitude: z.coerce.number().min(-180).max(180).optional(),
  respectPriority: z.boolean().default(true),
});

export const inventoryMovementSchema = z.object({
  warehouseId: z.string().uuid(),
  zoneId: z.string().uuid().nullable().optional(),
  inventoryItemId: z.string().uuid(),
  shipmentId: z.string().uuid().nullable().optional(),
  movementType: z.enum(["receipt", "putaway", "transfer", "pick", "dispatch", "adjustment", "return"]),
  quantity: z.coerce.number().int().refine((v) => v !== 0, "Quantidade não pode ser zero"),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
});

export const invoiceSchema = z.object({
  customerId: z.string().uuid(),
  shipmentId: z.string().uuid().nullable().optional(),
  subtotalCents: z.coerce.number().int().min(0),
  vatRatePct: z.coerce.number().min(0).max(100).default(23),
  dueInDays: z.coerce.number().int().min(0).max(180).default(30),
});

export const invoiceStatusSchema = z.object({ status: z.enum(["draft", "issued", "paid", "overdue", "void"]) });

export const userCreateSchema = z.object({
  email: emailSchema,
  fullName: trimmed(2, 120, "Nome"),
  role: z.enum(["admin", "operations_manager", "dispatcher", "warehouse_operator", "driver", "finance", "customer"]),
  password: z.string().min(10, "Mínimo 10 caracteres").max(200),
  customerId: z.string().uuid().nullable().optional(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

export const documentUploadSchema = z.object({
  shipmentId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  documentType: z.enum(["pod_photo", "signature", "invoice", "customs", "other"]),
  filename: z.string().trim().min(1).max(160),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]),
  dataBase64: z.string().min(10).max(8_000_000),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;
export type PodInput = z.infer<typeof podSchema>;
