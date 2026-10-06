import { readFileSync } from "node:fs";
import path from "node:path";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { formatUsd } from "@/lib/pricing";
import { formatNgn } from "@/lib/money";
import type { Subscription } from "@/lib/supabase/types";

/**
 * P2-312 — the receipt.
 *
 * Printed in black on white regardless of the site's theme. A receipt is a
 * document someone keeps, forwards to an accountant and prints; it is not a
 * screen, and it should not carry a dark background into a printer.
 *
 * The brand accent appears once, as a rule under the heading. That is enough
 * to identify it as ours without costing a toner cartridge.
 */

const ACCENT = "#FFB020";
const INK = "#111111";
const MUTED = "#555555";

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontSize: 10,
    color: INK,
    fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF",
  },
  logo: { width: 150 },
  rule: { marginTop: 12, height: 2, backgroundColor: ACCENT, width: 56 },
  title: { marginTop: 28, fontSize: 20, fontFamily: "Helvetica-Bold" },
  meta: { marginTop: 6, color: MUTED },
  section: { marginTop: 28 },
  sectionTitle: {
    fontSize: 8,
    letterSpacing: 1,
    color: MUTED,
    fontFamily: "Helvetica-Bold",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#DDDDDD",
  },
  label: { color: MUTED },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },
  note: { marginTop: 28, color: MUTED, lineHeight: 1.5 },
  footer: {
    position: "absolute",
    bottom: 36,
    left: 48,
    right: 48,
    fontSize: 8,
    color: MUTED,
    lineHeight: 1.5,
  },
});

/**
 * Read from disk rather than fetched over HTTP.
 *
 * A receipt is rendered on the server, often by a background job, and a URL
 * would make it depend on the site being reachable from inside itself — which
 * is exactly the moment it is not, during a deploy. Read once and cached,
 * since the file does not change between renders.
 *
 * The light wordmark, because the page is white.
 */
let logoCache: Buffer | null = null;
function logo(): Buffer {
  logoCache ??= readFileSync(path.join(process.cwd(), "public", "logo-light.png"));
  return logoCache;
}

const METHOD_LABEL: Record<Subscription["method"], string> = {
  alatpay_transfer: "Bank transfer",
  alatpay_card: "Card",
  usdt_trc20: "USDT (TRC-20)",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

function date(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function Receipt({
  subscription,
  email,
}: {
  subscription: Subscription;
  email: string;
}) {
  const s = subscription;

  return (
    <Document
      title={`Highzcore receipt ${s.id.slice(0, 8)}`}
      author="Highzcore"
    >
      <Page size="A4" style={styles.page}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an <img>; PDFs carry no alt text */}
        <Image style={styles.logo} src={logo()} />
        <View style={styles.rule} />

        <Text style={styles.title}>Receipt</Text>
        {/* The row id doubles as the receipt number — it is already unique and
            already the thing support would ask for. */}
        <Text style={styles.meta}>No. {s.id}</Text>
        <Text style={styles.meta}>Issued {date(s.starts_at ?? s.created_at)}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BILLED TO</Text>
          <Text style={{ marginTop: 8 }}>{email}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SUBSCRIPTION</Text>
          <Row
            label="Term"
            value={s.months === 1 ? "1 month" : `${s.months} months`}
          />
          <Row label="From" value={date(s.starts_at)} />
          <Row label="Until" value={date(s.expires_at)} />
          <Row label="Paid by" value={METHOD_LABEL[s.method]} />
          {s.provider_ref ? (
            <Row label="Payment reference" value={s.provider_ref} />
          ) : null}

          <View style={styles.total}>
            <Text>Total</Text>
            <Text>{formatUsd(s.amount_usd)}</Text>
          </View>

          {/* Both figures appear when there was an NGN leg: the dollar amount
              is what was agreed, the naira amount is what actually left their
              bank, and an accountant needs the second one. */}
          {s.amount_ngn !== null && s.fx_usd_ngn_e6 !== null ? (
            <Text style={{ marginTop: 8, color: MUTED }}>
              Charged as {formatNgn(s.amount_ngn)} at ₦
              {(s.fx_usd_ngn_e6 / 1_000_000).toFixed(2)} per US dollar.
            </Text>
          ) : null}
        </View>

        <Text style={styles.note}>
          This is a software subscription. It is not a deposit into a trading
          account and it is not an investment. Your trading funds are held by
          Vantage in your own name.
        </Text>

        <Text style={styles.footer}>
          Any performance fee is configured inside Vantage&apos;s management
          panel and is calculated and paid out by Vantage. It does not pass
          through Highzcore and does not appear on this receipt.
          {"\n"}
          Trading carries risk of loss. Past performance does not predict future
          results.
        </Text>
      </Page>
    </Document>
  );
}
