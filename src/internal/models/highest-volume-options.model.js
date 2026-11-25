export const highestVolumeOptionsModel = {
  type: "object",
  required: ["symbol", "ltpRange", "highestVolume"],
  properties: {
    symbol: { type: "string", description: "Fyers underlying symbol." },
    ltpRange: {
      type: "object",
      required: ["ltpMin", "ltpMax"],
      properties: {
        ltpMin: {
          type: "number",
          nullable: true,
          description: "Inclusive minimum option LTP; null means unbounded.",
        },
        ltpMax: {
          type: "number",
          nullable: true,
          description: "Inclusive maximum option LTP; null means unbounded.",
        },
      },
    },
    highestVolume: {
      type: "object",
      required: ["CE", "PE"],
      description: "Exactly one highest-volume matching call and put contract; a side is null when no contract matches.",
      properties: {
        CE: {
          type: "object",
          nullable: true,
          allOf: [{ $ref: "#/components/schemas/OptionChainInstrument" }],
        },
        PE: {
          type: "object",
          nullable: true,
          allOf: [{ $ref: "#/components/schemas/OptionChainInstrument" }],
        },
      },
    },
  },
};
