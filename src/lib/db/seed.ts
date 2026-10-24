import { hashPassword } from "@/lib/auth/password";
import { demoId } from "@/lib/ids";
import type { Db } from "./types";

/**
 * DEMONSTRATION DATA ONLY.
 * Every organisation created here is flagged `data_mode = 'demo'` and the UI
 * labels it. Nothing in this file may be used as a source of business claims.
 */

export const DEMO_ORG_ID = demoId(1);
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "Veltrix!2026";

const id = demoId;
const iso = (d: Date) => d.toISOString();
const daysAgo = (days: number, hour = 9) => {
  const d = new Date(Date.UTC(2026, 9, 23, hour, 0, 0));
  d.setUTCDate(d.getUTCDate() - days);
  return iso(d);
};
const hoursAfter = (isoDate: string, hours: number) =>
  iso(new Date(new Date(isoDate).getTime() + hours * 3600_000));

interface SeedProfile {
  n: number;
  email: string;
  name: string;
  role: string;
  customerId?: string;
}

export async function seedDemoData(db: Db): Promise<void> {
  const existing = await db.get<{ c: number }>("SELECT COUNT(*) AS c FROM organizations");
  if (existing && Number(existing.c) > 0) return;

  const now = iso(new Date(Date.UTC(2026, 9, 23, 9, 0, 0)));
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // ---------------------------------------------------------------- organisation
  await db.run(
    `INSERT INTO organizations (id, name, legal_name, tax_number, country_code, default_currency, timezone, data_mode, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [DEMO_ORG_ID, "VELTRIX Demo", "VELTRIX Demo Lda. (fictício)", "500000000", "PT", "EUR", "Europe/Lisbon", "demo", "active", daysAgo(180), now],
  );

  // -------------------------------------------------------------------- customers
  const customerSeeds = [
    { n: 20, company: "Nordvolt Componentes, Lda.", contact: "Ana Ribeiro", email: "ana@nordvolt.example", city: "Porto", type: "business" },
    { n: 21, company: "Casa Atlântica Mobiliário", contact: "Rui Martins", email: "rui@casaatlantica.example", city: "Lisboa", type: "business" },
    { n: 22, company: "Cereal Oeste Distribuição", contact: "Helena Duarte", email: "helena@cerealoeste.example", city: "Leiria", type: "business" },
    { n: 23, company: null, contact: "Tiago Mendes", email: "tiago.mendes@example.com", city: "Coimbra", type: "individual" },
    { n: 24, company: "Maputo Fresh Import", contact: "Ernesto Balate", email: "ernesto@maputofresh.example", city: "Maputo", type: "business" },
    { n: 25, company: "Farmácia Central Beira", contact: "Sofia Nunes", email: "sofia@farmaciabeira.example", city: "Aveiro", type: "business" },
  ];
  for (const c of customerSeeds) {
    await db.run(
      `INSERT INTO customers (id, organization_id, customer_type, company_name, contact_name, email, phone, tax_number, billing_address, billing_postal_code, billing_city, billing_country_code, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id(c.n), DEMO_ORG_ID, c.type, c.company, c.contact, c.email, "+351 200 000 000",
        c.type === "business" ? `50${c.n}00000` : null,
        `Rua de Demonstração ${c.n - 18}`, `30${c.n - 20}0-000`, c.city,
        c.city === "Maputo" ? "MZ" : "PT", "active", daysAgo(150), now,
      ],
    );
  }

  // -------------------------------------------------------------------- addresses
  const addressSeeds = [
    { n: 30, city: "Porto", line: "Zona Industrial da Maia, Lote 12", postal: "4475-142", cc: "PT", lat: 41.2361, lng: -8.6199 },
    { n: 31, city: "Lisboa", line: "Av. da Liberdade 110, Armazém 3", postal: "1250-146", cc: "PT", lat: 38.7223, lng: -9.1451 },
    { n: 32, city: "Leiria", line: "Parque Industrial Sul, Rua C 5", postal: "2415-191", cc: "PT", lat: 39.7436, lng: -8.8071 },
    { n: 33, city: "Coimbra", line: "Rua do Brasil 220", postal: "3030-175", cc: "PT", lat: 40.2033, lng: -8.4103 },
    { n: 34, city: "Aveiro", line: "Rua de Ovar 88", postal: "3800-225", cc: "PT", lat: 40.6405, lng: -8.6538 },
    { n: 35, city: "Faro", line: "Zona Industrial de Loulé, Lote 7", postal: "8100-272", cc: "PT", lat: 37.0194, lng: -7.9304 },
    { n: 36, city: "Braga", line: "Rua dos Chãos 45", postal: "4700-212", cc: "PT", lat: 41.5454, lng: -8.4265 },
    { n: 37, city: "Maputo", line: "Av. das Indústrias 410", postal: "1100", cc: "MZ", lat: -25.9692, lng: 32.5732 },
    { n: 38, city: "Viseu", line: "Estrada de Nelas 33", postal: "3500-135", cc: "PT", lat: 40.6566, lng: -7.9125 },
    { n: 39, city: "Setúbal", line: "Rua da Indústria 12", postal: "2910-010", cc: "PT", lat: 38.5244, lng: -8.8882 },
  ];
  for (const a of addressSeeds) {
    await db.run(
      `INSERT INTO addresses (id, organization_id, label, address_line, postal_code, city, country_code, latitude, longitude, validated_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id(a.n), DEMO_ORG_ID, a.city, a.line, a.postal, a.city, a.cc, a.lat, a.lng, daysAgo(120), daysAgo(150)],
    );
  }

  // ---------------------------------------------------------- warehouse + zones
  await db.run(`INSERT INTO warehouses (id, organization_id, name, address_id, status, created_at) VALUES (?,?,?,?,?,?)`, [
    id(90), DEMO_ORG_ID, "Hub Central — Coimbra (demo)", id(33), "active", daysAgo(120),
  ]);
  const zoneSeeds = [
    { n: 91, name: "Receção A", type: "receiving", cap: 120, occ: 74 },
    { n: 92, name: "Expedição B", type: "dispatch", cap: 90, occ: 51 },
    { n: 93, name: "Armazenagem C1", type: "storage", cap: 220, occ: 168 },
    { n: 94, name: "Armazenagem C2", type: "storage", cap: 220, occ: 96 },
    { n: 95, name: "Picking D", type: "picking", cap: 60, occ: 22 },
    { n: 96, name: "Devoluções E", type: "returns", cap: 40, occ: 9 },
  ];
  for (const z of zoneSeeds) {
    await db.run(
      `INSERT INTO warehouse_zones (id, warehouse_id, name, zone_type, capacity_pallets, occupied_pallets, status) VALUES (?,?,?,?,?,?,?)`,
      [id(z.n), id(90), z.name, z.type, z.cap, z.occ, z.occ >= z.cap ? "full" : "active"],
    );
  }

  // ------------------------------------------------------------------- inventory
  const itemSeeds = [
    { n: 100, sku: "SKU-NV-100", name: "Conversor industrial 5kW", uom: "unit" },
    { n: 101, sku: "SKU-CA-220", name: "Cadeira de escritório modelo Atlântico", uom: "unit" },
    { n: 102, sku: "SKU-CO-330", name: "Caixa de cereais 12kg", uom: "box" },
    { n: 103, sku: "SKU-FB-410", name: "Farmacêutico: embalagem secundária", uom: "pallet" },
    { n: 104, sku: "SKU-MF-550", name: "Contentor refrigerado 20ft", uom: "unit" },
  ];
  for (const item of itemSeeds) {
    await db.run(
      `INSERT INTO inventory_items (id, organization_id, sku, name, unit_of_measure, created_at) VALUES (?,?,?,?,?,?)`,
      [id(item.n), DEMO_ORG_ID, item.sku, item.name, item.uom, daysAgo(100)],
    );
  }

  // -------------------------------------------------------------------- profiles
  const profileSeeds: SeedProfile[] = [
    { n: 10, email: "super@veltrix.example", name: "Marta Oliveira", role: "super_admin" },
    { n: 11, email: "admin@veltrix.example", name: "Paulo Esteves", role: "admin" },
    { n: 12, email: "ops@veltrix.example", name: "Cátia Fonseca", role: "operations_manager" },
    { n: 13, email: "dispatch@veltrix.example", name: "Nuno Antunes", role: "dispatcher" },
    { n: 14, email: "warehouse@veltrix.example", name: "Inês Costa", role: "warehouse_operator" },
    { n: 15, email: "driver@veltrix.example", name: "João Silva", role: "driver" },
    { n: 16, email: "driver2@veltrix.example", name: "Miguel Santos", role: "driver" },
    { n: 17, email: "finance@veltrix.example", name: "Ricardo Lopes", role: "finance" },
    { n: 18, email: "cliente@nordvolt.example", name: "Ana Ribeiro", role: "customer", customerId: id(20) },
    { n: 19, email: "cliente@grupopt.example", name: "Rui Martins", role: "customer", customerId: id(21) },
  ];
  for (const p of profileSeeds) {
    await db.run(
      `INSERT INTO profiles (id, organization_id, auth_provider, email, password_hash, full_name, phone, role, status, customer_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id(p.n), DEMO_ORG_ID, "local", p.email, passwordHash, p.name, "+351 900 000 000", p.role, "active", p.customerId ?? null, daysAgo(120), now],
    );
  }

  // ---------------------------------------------------------- vehicles + drivers
  const vehicleSeeds = [
    { n: 70, plate: "AA-00-VX", type: "van", w: 1200, v: 12, status: "in_use" },
    { n: 71, plate: "BB-11-VX", type: "truck", w: 7500, v: 42, status: "available" },
    { n: 72, plate: "CC-22-VX", type: "electric_van", w: 950, v: 9, status: "available" },
    { n: 73, plate: "DD-33-VX", type: "truck", w: 12000, v: 60, status: "maintenance" },
  ];
  for (const v of vehicleSeeds) {
    await db.run(
      `INSERT INTO vehicles (id, organization_id, registration_number, vehicle_type, capacity_weight_kg, capacity_volume_m3, status, last_inspection_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id(v.n), DEMO_ORG_ID, v.plate, v.type, v.w, v.v, v.status, daysAgo(60), daysAgo(120), now],
    );
  }
  const driverSeeds = [
    { n: 80, profile: id(15), licence: "P-123456", expiry: "2028-04-12" },
    { n: 81, profile: id(16), licence: "P-654321", expiry: "2027-11-30" },
  ];
  for (const d of driverSeeds) {
    await db.run(
      `INSERT INTO drivers (id, organization_id, profile_id, licence_number, licence_expiry, employment_status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id(d.n), DEMO_ORG_ID, d.profile, d.licence, d.expiry, "active", daysAgo(110), now],
    );
  }

  // ------------------------------------------------------------------- shipments
  type ShipmentSeed = {
    n: number;
    customer: number;
    origin: number;
    destination: number;
    service: string;
    status: string;
    priority: string;
    weight: number;
    volume: number;
    quoted: number;
    ageDays: number;
  };
  const shipments: ShipmentSeed[] = [
    { n: 200, customer: 20, origin: 30, destination: 31, service: "express", status: "delivered", priority: "high", weight: 320, volume: 2.4, quoted: 18900, ageDays: 12 },
    { n: 201, customer: 21, origin: 31, destination: 34, service: "freight", status: "delivered", priority: "normal", weight: 1450, volume: 18.2, quoted: 64000, ageDays: 10 },
    { n: 202, customer: 22, origin: 32, destination: 35, service: "standard", status: "delivered", priority: "normal", weight: 860, volume: 6.1, quoted: 31250, ageDays: 8 },
    { n: 203, customer: 23, origin: 33, destination: 36, service: "standard", status: "delivered", priority: "low", weight: 12, volume: 0.1, quoted: 2450, ageDays: 7 },
    { n: 204, customer: 24, origin: 37, destination: 31, service: "international", status: "in_transit", priority: "high", weight: 2400, volume: 28.0, quoted: 289000, ageDays: 5 },
    { n: 205, customer: 25, origin: 34, destination: 33, service: "express", status: "out_for_delivery", priority: "urgent", weight: 45, volume: 0.4, quoted: 8900, ageDays: 2 },
    { n: 206, customer: 20, origin: 30, destination: 32, service: "standard", status: "picked_up", priority: "normal", weight: 180, volume: 1.5, quoted: 12400, ageDays: 2 },
    { n: 207, customer: 21, origin: 31, destination: 39, service: "same_day", status: "assigned", priority: "high", weight: 75, volume: 0.8, quoted: 9900, ageDays: 1 },
    { n: 208, customer: 22, origin: 32, destination: 38, service: "standard", status: "confirmed", priority: "normal", weight: 540, volume: 4.2, quoted: 21500, ageDays: 1 },
    { n: 209, customer: 23, origin: 33, destination: 30, service: "standard", status: "quoted", priority: "normal", weight: 22, volume: 0.2, quoted: 3100, ageDays: 1 },
    { n: 210, customer: 25, origin: 34, destination: 36, service: "express", status: "exception", priority: "urgent", weight: 8, volume: 0.05, quoted: 5400, ageDays: 4 },
    { n: 211, customer: 20, origin: 30, destination: 35, service: "standard", status: "on_hold", priority: "normal", weight: 640, volume: 5.6, quoted: 27600, ageDays: 6 },
    { n: 212, customer: 23, origin: 33, destination: 31, service: "standard", status: "failed_delivery", priority: "normal", weight: 18, volume: 0.15, quoted: 2900, ageDays: 3 },
    { n: 213, customer: 24, origin: 37, destination: 37, service: "international", status: "pending_quote", priority: "low", weight: 900, volume: 9.0, quoted: 0, ageDays: 0 },
  ];

  const statusPath: Record<string, string[]> = {
    pending_quote: ["pending_quote"],
    quoted: ["pending_quote", "quoted"],
    confirmed: ["pending_quote", "quoted", "confirmed"],
    assigned: ["pending_quote", "quoted", "confirmed", "assigned"],
    picked_up: ["pending_quote", "quoted", "confirmed", "assigned", "picked_up"],
    in_transit: ["pending_quote", "quoted", "confirmed", "assigned", "picked_up", "in_transit"],
    out_for_delivery: ["pending_quote", "quoted", "confirmed", "assigned", "picked_up", "in_transit", "out_for_delivery"],
    delivered: ["pending_quote", "quoted", "confirmed", "assigned", "picked_up", "in_transit", "out_for_delivery", "delivered"],
    exception: ["pending_quote", "quoted", "confirmed", "assigned", "picked_up", "in_transit", "exception"],
    on_hold: ["pending_quote", "quoted", "confirmed", "on_hold"],
    failed_delivery: ["pending_quote", "quoted", "confirmed", "assigned", "picked_up", "in_transit", "out_for_delivery", "failed_delivery"],
    returned: ["pending_quote", "quoted", "confirmed", "assigned", "picked_up", "in_transit", "out_for_delivery", "failed_delivery", "returned"],
    cancelled: ["pending_quote", "quoted", "cancelled"],
  };

  const eventCopy: Record<string, string> = {
    pending_quote: "Pedido de transporte recebido",
    quoted: "Orçamento enviado ao cliente",
    confirmed: "Encomenda confirmada",
    assigned: "Atribuída a motorista e veículo",
    picked_up: "Recolha concluída",
    in_transit: "Em trânsito entre hubs",
    out_for_delivery: "Em distribuição — última milha",
    delivered: "Entregue ao destinatário",
    exception: "Ocorrência registada: acesso condicionado",
    on_hold: "Colocada em espera a pedido do cliente",
    failed_delivery: "Tentativa de entrega falhada",
    returned: "Devolvida ao remetente",
    cancelled: "Cancelada pelo cliente",
  };

  for (const s of shipments) {
    const created = daysAgo(s.ageDays, 8);
    const path = statusPath[s.status] ?? ["pending_quote"];
    const estimated = hoursAfter(created, 24 * (s.service === "same_day" ? 1 : s.service === "express" ? 2 : 4));
    // Delivery timestamp must fall after every preceding event in the canonical path.
    const deliveredAt = s.status === "delivered" ? hoursAfter(created, (path.length + 1) * 4) : null;
    const tracking = `VX2026${String(s.n - 199).padStart(4, "0")}${String.fromCharCode(65 + (s.n % 26))}${String.fromCharCode(72 + (s.n % 20))}`;

    await db.run(
      `INSERT INTO shipments (id, organization_id, tracking_code, customer_id, origin_address_id, destination_address_id, service_type, status, priority,
        requested_pickup_at, estimated_delivery_at, actual_delivery_at, total_weight_kg, volume_m3, currency, quoted_amount_cents, final_amount_cents,
        notes, exception_reason, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id(s.n), DEMO_ORG_ID, tracking, id(s.customer), id(s.origin), id(s.destination), s.service, s.status, s.priority,
        hoursAfter(created, 6), estimated, deliveredAt, s.weight, s.volume, "EUR", s.quoted,
        s.status === "delivered" ? s.quoted : null,
        s.n % 5 === 0 ? "Instruções: entregar em horário laboral." : null,
        s.status === "exception" ? "Destinatário ausente na primeira tentativa" : null,
        id(13), created, deliveredAt ?? created,
      ],
    );

    // item lines
    await db.run(
      `INSERT INTO shipment_items (id, shipment_id, description, quantity, weight_kg, length_cm, width_cm, height_cm, declared_value_cents, handling_instructions, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id(s.n + 1000), id(s.n), `Volume demo ${s.n}`, Math.max(1, Math.round(s.weight / 40)), s.weight, 120, 80, 100, s.quoted * 3, "Frágil", created],
    );

    // chronological events following the *real* status machine order
    let eventTime = created;
    let previous: string | null = null;
    for (const step of path) {
      eventTime = hoursAfter(eventTime, 4);
      await db.run(
        `INSERT INTO shipment_events (id, shipment_id, event_type, previous_status, new_status, description, location, latitude, longitude, actor_id, occurred_at, metadata)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id(s.n * 100 + path.indexOf(step) + 10),
          id(s.n),
          step === "delivered" ? "delivery_confirmed" : "status_change",
          previous,
          step,
          eventCopy[step] ?? step,
          step === "delivered" ? "Destino" : "Hub Central — Coimbra",
          step === "delivered" ? 40.2033 : 40.2111,
          step === "delivered" ? -8.4103 : -8.4292,
          step === "pending_quote" ? id(13) : id(15),
          eventTime,
          null,
        ],
      );
      previous = step;
    }

    if (s.status === "delivered") {
      await db.run(
        `INSERT INTO proof_of_delivery (id, shipment_id, received_by, signature_path, photo_paths, notes, latitude, longitude, delivered_at, submitted_by)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id(s.n + 2000), id(s.n), "Receptor autorizado (demo)", null, JSON.stringify([]), "Entrega confirmada em demonstração", 40.2033, -8.4103, deliveredAt, id(15)],
      );
    }
  }

  // ---------------------------------------------------------------------- routes
  const routeSeeds = [
    { n: 300, date: daysAgo(0, 7).slice(0, 10), status: "in_progress", driver: 80, vehicle: 70, stops: [205, 206] },
    { n: 301, date: daysAgo(1, 7).slice(0, 10), status: "completed", driver: 81, vehicle: 71, stops: [207] },
    { n: 302, date: daysAgo(2, 7).slice(0, 10), status: "planned", driver: 80, vehicle: 72, stops: [208] },
  ];
  for (const r of routeSeeds) {
    await db.run(
      `INSERT INTO routes (id, organization_id, route_date, name, status, planned_distance_km, planned_duration_min, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id(r.n), DEMO_ORG_ID, r.date, `Rota demo ${r.n - 299}`, r.status, 128.4, 210, id(13), daysAgo(1, 18), now],
    );
    let seq = 1;
    for (const shipmentN of r.stops) {
      const shipment = shipments.find((s) => s.n === shipmentN);
      const address = addressSeeds.find((a) => a.n === shipment?.destination);
      await db.run(
        `INSERT INTO route_stops (id, route_id, shipment_id, driver_id, vehicle_id, sequence_number, stop_type, planned_arrival_at, actual_arrival_at, status, latitude, longitude, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id(r.n * 10 + seq), id(r.n), id(shipmentN), id(r.driver), id(r.vehicle), seq, "delivery",
          `${r.date}T${String(8 + seq).padStart(2, "0")}:30:00.000Z`, null,
          r.status === "completed" ? "completed" : "pending",
          address?.lat ?? null, address?.lng ?? null, null,
        ],
      );
      seq += 1;
    }
  }

  // ------------------------------------------------------- inventory movements
  const movements = [
    { n: 1100, item: 100, type: "receipt", qty: 40, zone: 91, days: 14 },
    { n: 1101, item: 101, type: "putaway", qty: 25, zone: 93, days: 13 },
    { n: 1102, item: 102, type: "pick", qty: -12, zone: 95, days: 9 },
    { n: 1103, item: 103, type: "receipt", qty: 60, zone: 91, days: 6 },
    { n: 1104, item: 104, type: "transfer", qty: 4, zone: 94, days: 3 },
  ];
  for (const m of movements) {
    await db.run(
      `INSERT INTO inventory_movements (id, warehouse_id, zone_id, inventory_item_id, shipment_id, movement_type, quantity, reference, actor_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id(m.n), id(90), id(m.zone), id(m.item), null, m.type, m.qty, `DEMO-${m.n}`, id(14), daysAgo(m.days)],
    );
  }

  // ----------------------------------------------------------- quotes/invoices
  const quoteStatuses = ["sent", "accepted", "draft", "rejected", "expired"];
  for (let i = 0; i < 5; i += 1) {
    const subtotal = [12400, 45800, 8900, 21000, 33000][i] as number;
    const tax = Math.round(subtotal * 0.23);
    await db.run(
      `INSERT INTO quotes (id, organization_id, reference, customer_id, contact_name, contact_email, contact_phone, origin, destination, service_type,
        weight_kg, volume_m3, currency, subtotal_cents, tax_cents, total_cents, status, valid_until, notes, description, created_by, sent_at, decided_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id(420 + i), DEMO_ORG_ID, `QT-2026-${100 + i}`, id(20 + (i % 5)), `Contacto demo ${i + 1}`, `orcamento${i}@example.com`,
        "+351 200 000 001", "Coimbra, PT", (["Lisboa, PT", "Porto, PT", "Maputo, MZ", "Faro, PT", "Braga, PT"][i] as string), "standard",
        120 + i * 40, 1.2 + i, "EUR", subtotal, tax, subtotal + tax, quoteStatuses[i] as string, "2026-11-30", null,
        "Transporte dedicado (dados demo)", id(11),
        quoteStatuses[i] === "draft" ? null : daysAgo(9 - i),
        ["accepted", "rejected"].includes(quoteStatuses[i] as string) ? daysAgo(6 - i) : null,
        daysAgo(9 - i), now,
      ],
    );
    const quoteStatus = quoteStatuses[i] as string;
    const quoteCreatedAt = daysAgo(9 - i);
    const history: { from: string | null; to: string; at: string; note: string }[] = [
      { from: null, to: "draft", at: quoteCreatedAt, note: "Orçamento demo criado" },
    ];
    if (quoteStatus !== "draft") {
      const sentAt = daysAgo(8 - i);
      history.push({ from: "draft", to: "sent", at: sentAt, note: "Enviado ao contacto demo" });
      if (quoteStatus !== "sent") {
        history.push({
          from: "sent",
          to: quoteStatus,
          at: daysAgo(6 - i),
          note:
            quoteStatus === "accepted"
              ? "Aceite pelo cliente"
              : quoteStatus === "rejected"
                ? "Recusado pelo cliente"
                : "Validade expirada sem resposta",
        });
      }
    }
    for (const [eventIndex, event] of history.entries()) {
      await db.run(
        `INSERT INTO quote_events (id, quote_id, organization_id, previous_status, new_status, amount_cents, actor_id, notes, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [id(500 + i * 3 + eventIndex), id(420 + i), DEMO_ORG_ID, event.from, event.to, subtotal + tax, id(11), event.note, event.at],
      );
    }
  }
  const invoiceSeeds = [
    { n: 400, num: "FT-2026-0001", customer: 20, total: 23247, status: "paid", issued: 12 },
    { n: 401, num: "FT-2026-0002", customer: 21, total: 78720, status: "issued", issued: 6 },
    { n: 402, num: "FT-2026-0003", customer: 22, total: 38437, status: "overdue", issued: 40 },
    { n: 403, num: "FT-2026-0004", customer: 24, total: 355470, status: "issued", issued: 2 },
  ];
  for (const inv of invoiceSeeds) {
    const subtotal = Math.round(inv.total / 1.23);
    await db.run(
      `INSERT INTO invoices (id, organization_id, customer_id, invoice_number, currency, subtotal_cents, tax_cents, total_cents, status, issued_at, due_at, external_reference, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id(inv.n), DEMO_ORG_ID, id(inv.customer), inv.num, "EUR", subtotal, inv.total - subtotal, inv.total, inv.status, daysAgo(inv.issued), daysAgo(inv.issued - 30), null, daysAgo(inv.issued), now],
    );
  }
  await db.run(
    `INSERT INTO payments (id, organization_id, invoice_id, provider, provider_reference, amount_cents, currency, status, idempotency_key, paid_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id(440), DEMO_ORG_ID, id(400), "manual", "DEMO-TRANSFER-001", 23247, "EUR", "succeeded", "demo-seed-payment-1", daysAgo(10), daysAgo(10)],
  );

  // ------------------------------------------------------------- pricing rules
  const pricing = [
    { service: "standard", base: 4500, kg: 85, m3: 1800, km: 55, min: 8500 },
    { service: "express", base: 7900, kg: 130, m3: 2600, km: 85, min: 12500 },
    { service: "same_day", base: 12000, kg: 190, m3: 3200, km: 120, min: 19000 },
    { service: "freight", base: 18000, kg: 45, m3: 1400, km: 70, min: 32000 },
    { service: "international", base: 25000, kg: 70, m3: 2100, km: 95, min: 45000 },
  ];
  for (let i = 0; i < pricing.length; i += 1) {
    const p = pricing[i]!;
    await db.run(
      `INSERT INTO pricing_rules (id, organization_id, service_type, base_fee_cents, per_kg_cents, per_m3_cents, per_km_cents, minimum_cents, fuel_surcharge_pct, vat_rate_pct, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id(720 + i), DEMO_ORG_ID, p.service, p.base, p.kg, p.m3, p.km, p.min, 8.5, 23, 1, daysAgo(90), now],
    );
  }

  // ------------------------------------------------- notifications + audit log
  const notifSeeds = [
    { n: 500, template: "shipment.delivered", recipient: "ana@nordvolt.example", status: "sent", channel: "email" },
    { n: 501, template: "shipment.created", recipient: "rui@casaatlantica.example", status: "queued", channel: "email" },
    { n: 502, template: "shipment.exception", recipient: "sofia@farmaciabeira.example", status: "failed", channel: "email" },
  ];
  for (const n of notifSeeds) {
    await db.run(
      `INSERT INTO notification_jobs (id, organization_id, recipient, channel, template, payload, status, attempts, last_error, scheduled_at, sent_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id(n.n), DEMO_ORG_ID, n.recipient, n.channel, n.template, JSON.stringify({ demo: true }), n.status,
        n.status === "failed" ? 3 : 1,
        n.status === "failed" ? "Provider not configured (demo)" : null,
        daysAgo(2), n.status === "sent" ? daysAgo(2) : null, daysAgo(2), now,
      ],
    );
  }
  const auditSeeds = [
    { action: "shipment.created", resource: "shipments", resourceId: id(209) },
    { action: "shipment.status_changed", resource: "shipments", resourceId: id(205) },
    { action: "invoice.issued", resource: "invoices", resourceId: id(403) },
  ];
  for (let i = 0; i < auditSeeds.length; i += 1) {
    const a = auditSeeds[i]!;
    await db.run(
      `INSERT INTO audit_logs (id, organization_id, actor_id, actor_email, action, resource_type, resource_id, metadata, ip_hash, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id(600 + i), DEMO_ORG_ID, id(13), "dispatch@veltrix.example", a.action, a.resource, a.resourceId, JSON.stringify({ demo: true }), null, daysAgo(3 - i)],
    );
  }

  // ------------------------------------------------------- integration settings
  const providers = ["supabase", "resend", "whatsapp", "maplibre", "routing", "payments", "sentry"];
  for (let i = 0; i < providers.length; i += 1) {
    await db.run(
      `INSERT INTO integration_settings (id, organization_id, provider, enabled, status, public_configuration, last_checked_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id(700 + i), DEMO_ORG_ID, providers[i] as string, 0, "not_configured", JSON.stringify({ note: "Configure via environment variables" }), null, daysAgo(100), now],
    );
  }
}
