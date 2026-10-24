/**
 * End-to-end smoke test against a running dev server.
 * Usage: node scripts/smoke.mjs http://localhost:3000 <sessionToken>
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
const TOKEN = process.argv[3];
if (!TOKEN) {
  console.error("missing session token");
  process.exit(1);
}

const results = [];
let failures = 0;

async function call(method, path, { body, token = TOKEN, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { cookie: `veltrix_session=${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html or csv */
  }
  return { status: response.status, json, text, headers: response.headers };
}

function check(name, condition, detail = "") {
  if (condition) {
    results.push(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures += 1;
    results.push(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("\n[1] Saúde e autenticação");
  const health = await call("GET", "/api/health", { token: null });
  check("GET /api/health", health.status === 200, health.json?.checks?.database);

  const anon = await call("GET", "/api/v1/shipments", { token: null });
  check("API sem sessão devolve 401", anon.status === 401);

  const badLogin = await call("POST", "/api/v1/auth/login", { body: { email: "x@y.z", password: "nope" }, token: null });
  check("login inválido não devolve sessão", badLogin.status >= 400 && badLogin.status < 500, `status ${badLogin.status}`);

  console.log("\n[2] Encomendas");
  const customers = await call("GET", "/api/v1/customers?pageSize=5");
  check("listar clientes", customers.status === 200 && Array.isArray(customers.json?.data), `${customers.json?.meta?.total ?? 0} clientes`);
  const customerId = customers.json?.data?.[0]?.id;

  const created = await call("POST", "/api/v1/shipments", {
    body: {
      customerId,
      serviceType: "standard",
      priority: "high",
      notes: "Encomenda criada pelo smoke test.",
      items: [{ description: "Palete de teste", quantity: 2, weightKg: 180 }],
      origin: { addressLine: "Rua do Teste 1", city: "Coimbra", countryCode: "PT", latitude: 40.2, longitude: -8.41 },
      destination: { addressLine: "Avenida do Teste 9", city: "Porto", countryCode: "PT", latitude: 41.15, longitude: -8.61 },
      quotedAmountCents: 12500,
    },
  });
  check("criar encomenda", created.status === 201, created.json?.data?.trackingCode);
  const shipmentId = created.json?.data?.id;
  const trackingCode = created.json?.data?.trackingCode;

  const idemKey = `smoke-idem-${Date.now()}`;
  const idemBody = {
    customerId,
    serviceType: "standard",
    items: [{ description: "Palete de teste", quantity: 2, weightKg: 180 }],
    origin: { addressLine: "Rua do Teste 1", city: "Coimbra", countryCode: "PT" },
    destination: { addressLine: "Avenida do Teste 9", city: "Porto", countryCode: "PT" },
    idempotencyKey: idemKey,
  };
  const idempotent = await call("POST", "/api/v1/shipments", { body: idemBody });
  const idempotent2 = await call("POST", "/api/v1/shipments", { body: idemBody });
  check(
    "chave de idempotência devolve a mesma encomenda",
    idempotent.status === 201 && idempotent2.status === 201 && idempotent2.json?.data?.id === idempotent.json?.data?.id,
  );

  const invalid = await call("POST", "/api/v1/shipments", { body: { customerId: "not-a-uuid" } });
  check("validação rejeita payload inválido", invalid.status === 422, invalid.json?.error?.code);

  const transitions = ["quoted", "confirmed", "assigned", "picked_up", "in_transit", "out_for_delivery"];
  let lastStatus = 0;
  for (const toStatus of transitions) {
    const response = await call("POST", `/api/v1/shipments/${shipmentId}/transitions`, { body: { toStatus } });
    lastStatus = response.status;
    if (response.status !== 200) results.push(`      · ${toStatus}: ${response.status} ${response.json?.error?.message ?? ""}`);
  }
  check("sequência de estados aceite", lastStatus === 200);

  const skipped = await call("POST", `/api/v1/shipments/${shipmentId}/transitions`, { body: { toStatus: "delivered" } });
  check("entrega bloqueada sem prova", skipped.status === 409, skipped.json?.error?.message);

  const pod = await call("POST", `/api/v1/shipments/${shipmentId}/proof-of-delivery`, {
    body: {
      receivedBy: "Recepção (smoke)",
      latitude: 41.15,
      longitude: -8.61,
      signatureDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    },
  });
  check("prova de entrega registada", pod.status === 201 || pod.status === 200, String(pod.status));

  const detail = await call("GET", `/api/v1/shipments/${shipmentId}`);
  check("estado final = delivered", detail.json?.data?.shipment?.status === "delivered");
  check("POD legível no detalhe", Boolean(detail.json?.data?.proofOfDelivery));

  const events = await call("GET", `/api/v1/shipments/${shipmentId}/events`);
  check("histórico de eventos presente", (events.json?.data?.length ?? 0) >= 7, `${events.json?.data?.length ?? 0} eventos`);

  console.log("\n[3] Rastreio público");
  const tracking = await call("GET", `/api/v1/tracking/${trackingCode}`, { token: null });
  check("rastreio público", tracking.status === 200, tracking.json?.data?.status);
  const serialised = JSON.stringify(tracking.json);
  check("rastreio não expõe PII", !serialised.includes("@") && !serialised.includes("Rua do Teste"), "sem email/morada");
  const unknown = await call("GET", "/api/v1/tracking/VX00000000ZZ", { token: null });
  check("código desconhecido devolve 404", unknown.status === 404);

  console.log("\n[4] Rotas");
  const routeShipment = await call("POST", "/api/v1/shipments", {
    body: {
      customerId,
      serviceType: "standard",
      items: [{ description: "Palete para rota", quantity: 1, weightKg: 90 }],
      origin: { addressLine: "Rua do Teste 1", city: "Coimbra", countryCode: "PT" },
      destination: { addressLine: "Avenida do Teste 9", city: "Lisboa", countryCode: "PT" },
      idempotencyKey: `smoke-route-${Date.now()}`,
    },
  });
  let routeId = null;
  const routeShipmentId = routeShipment.json?.data?.id;
  if (routeShipmentId) {
    for (const toStatus of ["quoted", "confirmed"]) {
      await call("POST", `/api/v1/shipments/${routeShipmentId}/transitions`, { body: { toStatus } });
    }
    const route = await call("POST", "/api/v1/routes", {
      body: { routeDate: new Date().toISOString().slice(0, 10), name: "Rota smoke", shipmentIds: [routeShipmentId] },
    });
    routeId = route.json?.data?.id ?? null;
    check("criar rota", route.status === 201, routeId ?? route.json?.error?.message);

    if (routeId) {
      const optimize = await call("POST", `/api/v1/routes/${routeId}/optimize`, { body: {} });
      check(
        "otimizar rota (marcada como estimativa sem motor)",
        optimize.status === 200 && optimize.json?.data?.estimated === true,
        `${optimize.json?.data?.provider ?? "n/d"} · ${optimize.json?.data?.distanceKm ?? 0} km`,
      );
      const dispatched = await call("POST", `/api/v1/routes/${routeId}/status`, { body: { status: "dispatched" } });
      check("despachar rota", dispatched.status === 200);
    }
  } else {
    check("criar rota", false, "não foi possível criar encomenda para rota");
  }

  console.log("\n[5] Comercial");
  const quote = await call("POST", "/api/v1/quotes", {
    token: null,
    body: {
      contactName: "Smoke Test",
      contactEmail: `smoke-${Date.now()}@example.com`,
      origin: "Coimbra",
      destination: "Braga",
      serviceType: "express",
      weightKg: 42,
      volumeM3: 0.4,
    },
  });
  check("orçamento público com preço calculado", quote.status === 201, quote.json?.data?.reference);

  const quotes = await call("GET", "/api/v1/quotes?pageSize=5");
  const quoteId = quotes.json?.data?.[0]?.id;
  if (quoteId) {
    const accepted = await call("POST", `/api/v1/quotes/${quoteId}/status`, { body: { status: "accepted" } });
    check("alterar estado do orçamento", accepted.status === 200 || accepted.status === 204, String(accepted.status));
  }

  const invoice = await call("POST", "/api/v1/invoices", {
    body: { customerId, shipmentId, subtotalCents: 50000, vatRatePct: 23, dueInDays: 15 },
  });
  check("emitir fatura interna", invoice.status === 201, invoice.json?.data?.invoiceNumber);

  const invoiceId = invoice.json?.data?.id;
  if (invoiceId) {
    const payment = await call("POST", "/api/v1/payments", {
      body: { invoiceId, amountCents: 50000, provider: "manual", reference: "SMOKE-1" },
    });
    check("registar pagamento manual", payment.status === 201 || payment.status === 200, String(payment.status));
  }

  console.log("\n[6] Armazém e relatórios");
  const zones = await call("GET", "/api/v1/warehouse/zones");
  check("listar zonas", zones.status === 200 && Array.isArray(zones.json?.data), `${zones.json?.data?.length ?? 0} zonas`);

  const overview = await call("GET", "/api/v1/analytics/overview");
  check("métricas com definições", overview.status === 200 && (overview.json?.data?.definitions?.length ?? 0) > 0);

  console.log("\n[7] Governação");
  const audit = await call("GET", "/app/shipments/export?format=csv");
  check("exportação CSV (auditada)", audit.status === 200 && audit.text.includes(","), `${audit.text.split("\n").length} linhas`);

  const cron = await call("GET", "/api/v1/cron/notifications", { token: null, headers: { authorization: "Bearer wrong" } });
  check("cron recusa segredo inválido", cron.status === 401 || cron.status === 503, `status ${cron.status}`);

  const webhook = await call("POST", "/api/v1/webhooks/payments", { token: null, body: { type: "ping" } });
  check("webhook exige assinatura", webhook.status === 401 || webhook.status === 503, `status ${webhook.status}`);

  console.log("\n[8] Isolamento");
  const bogus = await call("GET", "/api/v1/shipments/00000000-0000-4000-8000-000000000999");
  check("recurso inexistente devolve 404", bogus.status === 404);

  console.log(results.join("\n"));
  console.log(`\n${results.length - failures}/${results.length} verificações passaram`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("smoke test crashed", error);
  process.exit(1);
});
