/**
 * Runtime configuration. Every external integration is optional and is
 * reported honestly as "not_configured" until credentials exist.
 * Never read a NEXT_PUBLIC_* value here for anything secret.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim() === "") return undefined;
  return value.trim();
}

const databaseUrl = read("DATABASE_URL");

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  /** PostgreSQL (Supabase) connection string. When absent the app runs on the local SQLite demo store. */
  databaseUrl,
  /** "postgres" when a database URL is present, otherwise local demo storage. */
  dataMode: (databaseUrl ? "postgres" : "sqlite") as "postgres" | "sqlite",
  /** Secret used to sign session tokens and private-file URLs. Required in production. */
  authSecret: read("AUTH_SECRET"),
  appUrl: read("APP_URL") ?? read("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
  supabase: {
    url: read("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: read("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY"),
    get configured() {
      return Boolean(read("NEXT_PUBLIC_SUPABASE_URL") && read("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
    },
    get adminConfigured() {
      return Boolean(read("NEXT_PUBLIC_SUPABASE_URL") && read("SUPABASE_SERVICE_ROLE_KEY"));
    },
  },
  email: {
    resendApiKey: read("RESEND_API_KEY"),
    from: read("EMAIL_FROM") ?? "VELTRIX <no-reply@veltrix.example>",
    get configured() {
      return Boolean(read("RESEND_API_KEY"));
    },
  },
  whatsapp: {
    accessToken: read("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: read("WHATSAPP_PHONE_NUMBER_ID"),
    get configured() {
      return Boolean(read("WHATSAPP_ACCESS_TOKEN") && read("WHATSAPP_PHONE_NUMBER_ID"));
    },
  },
  maps: {
    styleUrl: read("NEXT_PUBLIC_MAP_STYLE_URL"),
    get configured() {
      return Boolean(read("NEXT_PUBLIC_MAP_STYLE_URL"));
    },
  },
  routing: {
    provider: read("ROUTING_PROVIDER") as "osrm" | "openrouteservice" | "graphhopper" | undefined,
    apiKey: read("MAP_ROUTING_API_KEY"),
    baseUrl: read("ROUTING_BASE_URL"),
    get configured() {
      const provider = read("ROUTING_PROVIDER");
      if (!provider) return false;
      if (provider === "osrm") return Boolean(read("ROUTING_BASE_URL"));
      return Boolean(read("MAP_ROUTING_API_KEY"));
    },
  },
  payments: {
    provider: read("PAYMENT_PROVIDER") as "stripe" | "mollie" | undefined,
    secretKey: read("PAYMENT_SECRET_KEY"),
    webhookSecret: read("PAYMENT_WEBHOOK_SECRET"),
    get configured() {
      return Boolean(read("PAYMENT_PROVIDER") && read("PAYMENT_SECRET_KEY") && read("PAYMENT_WEBHOOK_SECRET"));
    },
  },
  sentryDsn: read("SENTRY_DSN"),
  /** Uploaded POD photos / signatures. Local filesystem in demo mode. */
  uploadDir: read("UPLOAD_DIR") ?? ".data/uploads",
  /** Demo credentials shown on the login page. Only honoured when the org is in demo data mode. */
  demoMode: !databaseUrl,
} as const;

export function requireAuthSecret(): string {
  if (env.authSecret) return env.authSecret;
  if (env.isProduction) {
    throw new Error("AUTH_SECRET is not configured. Set it before running in production.");
  }
  // Deterministic development fallback so sessions survive a dev-server restart.
  return "veltrix-insecure-development-secret-do-not-use-in-production";
}
