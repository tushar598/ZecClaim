import { describe, it, expect } from "vitest";
import {
  parseVizorCsv,
  parseClientVizorCsv,
  toServerImportPayload,
} from "@/lib/zcash/zip324";

describe("Vizor ZIP 324 CSV Parser", () => {
  it("parses valid Vizor group gift-card export CSV", () => {
    const csvData = [
      "card_id,amount_zec,sweep_fee_buffer_zat,claim_token,ack_hash",
      "CARD-01,0.05000000,2000,sampletoken1234567890,e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "CARD-02,0.10000000,2000,sampletoken0987654321,e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ].join("\n");

    const parsed = parseVizorCsv(csvData);
    expect(parsed.totalCards).toBe(2);
    expect(parsed.totalZec).toBeCloseTo(0.15, 5);
    expect(parsed.cards[0].cardId).toBe("CARD-01");
    expect(parsed.cards[0].feeBufferZat).toBe(2000);
  });

  it("completely strips and purges #key= bearer key fragments from output", () => {
    const csvWithSecretKey = [
      "card_id,amount_zec,sweep_fee_buffer_zat,claim_token,ack_hash",
      "CARD-01,0.05000000,2000,https://zodl.app/claim?id=CARD-01#key=SECRET_SPENDING_KEY_DO_NOT_LEAK_12345,e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ].join("\n");

    const parsed = parseVizorCsv(csvWithSecretKey);
    const card = parsed.cards[0];

    // Verify #key= and secret were stripped
    expect(card.claimToken).not.toContain("#key=");
    expect(card.claimToken).not.toContain("SECRET_SPENDING_KEY");
    expect(card.claimToken).toBe("https://zodl.app/claim?id=CARD-01");

    // Verify serialization is 100% free of secret fragment
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain("#key=");
    expect(serialized).not.toContain("SECRET_SPENDING_KEY");
  });

  it("client-side parser preserves secretUri in browser memory and purges it from server payload", () => {
    const csvWithSecretKey = [
      "card_id,amount_zec,sweep_fee_buffer_zat,claim_url,ack_hash",
      "CARD-01,0.1,2000,https://vizor.cash/card/CARD-01#key=SUPER_SECRET_SPENDING_KEY_BYTES_64HEX,e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ].join("\n");

    // Client-side parse retains secretUri for SVG QR slip rendering
    const clientManifest = parseClientVizorCsv(csvWithSecretKey);
    expect(clientManifest.cards[0].secretUri).toContain("#key=SUPER_SECRET_SPENDING_KEY_BYTES_64HEX");
    expect(clientManifest.cards[0].claimToken).toBe("https://vizor.cash/card/CARD-01");

    // Server payload generation strictly purges secretUri and #key=
    const serverPayload = toServerImportPayload(clientManifest, "demo-nu7-campaign", true);
    expect(serverPayload.isSplitCustody).toBe(true);
    expect(serverPayload.cards[0].cardId).toBe("CARD-01");
    expect((serverPayload.cards[0] as Record<string, unknown>).secretUri).toBeUndefined();

    const serializedPayload = JSON.stringify(serverPayload);
    expect(serializedPayload).not.toContain("#key=");
    expect(serializedPayload).not.toContain("SUPER_SECRET_SPENDING_KEY");
  });

  it("strips uppercase #KEY= and URL-encoded %23key= fragments", () => {
    const csvWithVariants = [
      "card_id,amount_zec,sweep_fee_buffer_zat,claim_token,ack_hash",
      "CARD-01,0.05000000,2000,https://zodl.app/claim?id=CARD-01#KEY=UPPERCASE_SECRET_KEY,e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "CARD-02,0.05000000,2000,https://zodl.app/claim?id=CARD-02%23key=ENCODED_SECRET_KEY,e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ].join("\n");

    const parsed = parseVizorCsv(csvWithVariants);
    expect(parsed.cards[0].claimToken).toBe("https://zodl.app/claim?id=CARD-01");
    expect(parsed.cards[1].claimToken).toBe("https://zodl.app/claim?id=CARD-02");
  });

  it("throws when required headers are missing", () => {
    const invalidCsv = "invalid,header\n1,2";
    expect(() => parseVizorCsv(invalidCsv)).toThrow(/missing required columns/);
  });

  it("rejects cards with fee buffer below 2000 zatoshi limit", () => {
    const invalidFeeCsv = [
      "card_id,amount_zec,sweep_fee_buffer_zat,claim_token,ack_hash",
      "CARD-01,0.05000000,1000,sampletoken1234567890,e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ].join("\n");

    expect(() => parseVizorCsv(invalidFeeCsv)).toThrow();
  });

  it("parses real production Vizor, Zodl, and draft ZIP 324 URIs with flexible headers", () => {
    const realUrisCsv = [
      "card,amount,fee,link,ack",
      "CARD-VIZOR,0.05,2000,https://link.vizor.cash/payment-links/open#key=spending_key_vizor_bytes_hex_1234567890,e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "CARD-ZODL,0.10,2500,https://gift.zodl.com/redeem#key=spending_key_zodl_bytes_hex_0987654321,e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "CARD-ZIP324,0.15,3000,:65536/redeem_payload_data_anchor#key=spending_key_draft_zip324_scheme,e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ].join("\n");

    const parsedClient = parseClientVizorCsv(realUrisCsv);
    expect(parsedClient.totalCards).toBe(3);

    // 1. Production Vizor check
    expect(parsedClient.cards[0].secretUri).toBe(
      "https://link.vizor.cash/payment-links/open#key=spending_key_vizor_bytes_hex_1234567890"
    );
    expect(parsedClient.cards[0].claimToken).toBe("https://link.vizor.cash/payment-links/open");
    expect(parsedClient.cards[0].claimToken).not.toContain("#key=");

    // 2. Production Zodl check
    expect(parsedClient.cards[1].secretUri).toBe(
      "https://gift.zodl.com/redeem#key=spending_key_zodl_bytes_hex_0987654321"
    );
    expect(parsedClient.cards[1].claimToken).toBe("https://gift.zodl.com/redeem");
    expect(parsedClient.cards[1].claimToken).not.toContain("#key=");

    // 3. Draft ZIP 324 check (:65536 URI)
    expect(parsedClient.cards[2].secretUri).toBe(
      ":65536/redeem_payload_data_anchor#key=spending_key_draft_zip324_scheme"
    );
    expect(parsedClient.cards[2].claimToken).toBe(":65536/redeem_payload_data_anchor");
    expect(parsedClient.cards[2].claimToken).not.toContain("#key=");

    // Server import payload verification
    const serverPayload = toServerImportPayload(parsedClient, "demo-nu7-campaign", true);
    expect(serverPayload.cards.length).toBe(3);
    const serialized = JSON.stringify(serverPayload);
    expect(serialized).not.toContain("#key=");
    expect(serialized).not.toContain("spending_key_");
  });
});

describe("Client slip parser refuses to invent QR payloads", () => {
  it("throws when the CSV has no gift card link column or a row has no link", () => {
    const noLinkColumn = [
      "card_id,amount_zec,sweep_fee_buffer_zat,ack_hash",
      "CARD-01,0.05,2000,e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ].join("\n");
    expect(() => parseClientVizorCsv(noLinkColumn)).toThrow(/gift card link column/);

    const emptyLink = [
      "card_id,amount_zec,sweep_fee_buffer_zat,claim_url,ack_hash",
      "CARD-01,0.05,2000,,e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ].join("\n");
    expect(() => parseClientVizorCsv(emptyLink)).toThrow(/CARD-01 has no gift card link/);
  });
});
