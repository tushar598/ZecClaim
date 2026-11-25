/**
 * Judge-sandbox constants.
 *
 * Client-safe: this module has no Node.js imports so it can be used from client components
 * without pulling `crypto` polyfills into the browser bundle.
 * Everything here is public by design and only unlocks the demo campaign.
 */

export const DEMO_CAMPAIGN_ID = "demo-nu7-campaign";

export const DEMO_ADMIN_SECRET = "sec_demo_nu7_mumbai_organizer_secret_key";

export const DEMO_ACK_CODES: Record<string, string> = {
  "CARD-01": "ACK-7K4M9P2Q",
  "CARD-02": "ACK-9M3X8W1V",
  "CARD-03": "ACK-4T8B2N7Y",
  "CARD-04": "ACK-5P1R6Z9D",
  "CARD-05": "ACK-2W7L3J8S",
};

/** Raw claim tokens for the demo's UNCLAIMED Lane 2 slots. The server only stores their peppered hashes. */
export const DEMO_CLAIM_TOKENS = {
  slot2: "demo-claim-slot-02",
  slot4: "demo-claim-slot-04",
  slot5: "demo-claim-slot-05",
} as const;

/**
 * Address test vectors (Bech32m checksums and F4Jumble verified by the ZIP 316 decoder).
 * The "valid" vectors are well-formed Orchard Unified Addresses.
 */
export const ADDRESS_TEST_VECTORS = {
  testnet: {
    validShielded:
      "utest1hfsgxppesjnge0cuxqx8fu6ltnkmfwf4stx6rzxdp96n7gfeycgmxtugy0kmc3wz0m8fpvqgeg4nlm4wy8hnyml89ftsqlk0estuyzeq",
    rejectedTransparent: "tm9iMLAuYMzJ6kWYtU9b9PzX5Y1i68jU2L",
    rejectedMixed:
      "utest1lf858y9zmdc7jwfn5298uvfwgls9eu3p6mzrdncujeydzdqq2zx2aulhgxm3qc95r49dnz2gr5wad7zwu5gnawr3d0lr9all6stft3v49wzvy99w44jj6ta5093zr902wf44sepx054",
  },
  mainnet: {
    validShielded:
      "u13tdrywfznf4x4yccc7zmqp7lyf78vx0r4z8vrldyxn7jwyqxmn85mrdn5utaytvxx3r8wt4y4vah7m7g97y0fnf7qkydfrdmzsrlh020",
    rejectedTransparent: "t1VpYecBW5ocvDxXbZqM224uKq1h4u4wZkL",
    rejectedMixed:
      "u168xq6fhv7m99wa2dvuc8nw7qgzyzq3ysyu5kcy0vdu2aj40psmwfd5qz48try5ctqwc080h3nfsd9q8m0xhwr2hfxk5p2hh9u6kwgmy9x7x90ujfvjd4k5dlng42jlt0q4rt23m7fve",
  },
} as const;

/** NU7 testnet activation height (ZIP 259). Demo block heights sit after it. */
export const NU7_TESTNET_ACTIVATION_HEIGHT = 4_465_026;
