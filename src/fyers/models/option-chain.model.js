/**
 * Fyers option-chain response model.
 *
 * @typedef {object} OptionChainGreeks
 * @property {number} [delta] Option price sensitivity to the underlying price.
 * @property {number} [gamma] Change in delta for a change in the underlying price.
 * @property {number} [theta] Daily time decay.
 * @property {number} [vega] Sensitivity to implied volatility.
 * @property {number} [iv] Implied volatility.
 *
 * @typedef {object} OptionChainExpiry
 * @property {string} date Expiry date in DD-MM-YYYY format.
 * @property {string} expiry Expiry time as epoch seconds.
 * @property {string} [expiry_flag] Expiry category, such as weekly or monthly.
 *
 * @typedef {object} OptionChainInstrument
 * @property {string} symbol Fyers symbol.
 * @property {string} option_type Empty for the underlying, otherwise CE or PE.
 * @property {number} strike_price -1 for the underlying; otherwise the option strike.
 * @property {number} ltp Last traded price.
 * @property {number} [oi] Current open interest.
 * @property {number} [volume] Traded volume.
 * @property {OptionChainGreeks} [greeks] Included when requested.
 *
 * @typedef {object} OptionChainModel
 * @property {number} callOi Total call open interest.
 * @property {number} putOi Total put open interest.
 * @property {OptionChainExpiry[]} expiryData Available expiries.
 * @property {OptionChainInstrument} indiavixData India VIX quote.
 * @property {OptionChainInstrument[]} optionsChain Underlying followed by option contracts.
 */
export const optionChainModel = {
  type: "object",
  required: ["callOi", "putOi", "expiryData", "indiavixData", "optionsChain"],
  properties: {
    callOi: {
      type: "integer",
      description: "Total open interest for call options.",
    },
    putOi: {
      type: "integer",
      description: "Total open interest for put options.",
    },
    expiryData: {
      type: "array",
      description: "Available expiries for this underlying.",
      items: {
        type: "object",
        required: ["date", "expiry"],
        properties: {
          date: { type: "string", description: "Expiry date in DD-MM-YYYY format." },
          expiry: { type: "string", description: "Expiry time as epoch seconds." },
          expiry_flag: { type: "string", description: "Expiry category, such as weekly or monthly." },
        },
      },
    },
    indiavixData: {
      description: "India VIX quote.",
      allOf: [{ $ref: "#/components/schemas/OptionChainInstrument" }],
    },
    optionsChain: {
      type: "array",
      description: "Underlying instrument followed by call and put contracts.",
      items: { $ref: "#/components/schemas/OptionChainInstrument" },
    },
  },
};

export const optionChainInstrumentModel = {
  type: "object",
  required: ["symbol", "option_type", "strike_price"],
  properties: {
    ask: { type: "number", description: "Best ask price." },
    bid: { type: "number", description: "Best bid price." },
    description: { type: "string" },
    ex_symbol: { type: "string", description: "Underlying exchange symbol." },
    exchange: { type: "string", description: "Exchange name." },
    fp: { type: "number", description: "Underlying futures price." },
    fpch: { type: "number", description: "Change in underlying futures price." },
    fpchp: { type: "number", description: "Percentage change in underlying futures price." },
    fyToken: { type: "string", description: "Fyers instrument token." },
    ltp: { type: "number", description: "Last traded price." },
    ltpch: { type: "number", description: "Change in last traded price." },
    ltpchp: { type: "number", description: "Percentage change in last traded price." },
    oi: { type: "integer", description: "Current open interest." },
    oich: { type: "integer", description: "Change in open interest." },
    oichp: { type: "number", description: "Percentage change in open interest." },
    option_type: { type: "string", enum: ["", "CE", "PE"] },
    prev_oi: { type: "integer", description: "Previous open interest." },
    strike_price: {
      type: "number",
      description: "-1 identifies the underlying; otherwise this is the option strike.",
    },
    symbol: { type: "string", description: "Fyers symbol." },
    volume: { type: "integer", description: "Traded volume." },
    greeks: {
      type: "object",
      properties: {
        delta: { type: "number" },
        gamma: { type: "number" },
        theta: { type: "number" },
        vega: { type: "number" },
        iv: { type: "number", description: "Implied volatility." },
      },
    },
  },
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is OptionChainInstrument}
 */
function isOptionChainInstrument(value) {
  return (
    isRecord(value) &&
    typeof value.symbol === "string" &&
    typeof value.option_type === "string" &&
    typeof value.strike_price === "number"
  );
}

/**
 * Validate and return the Fyers payload without changing its original field names.
 * @param {unknown} data
 * @returns {OptionChainModel}
 */
export function parseOptionChainModel(data) {
  if (
    !isRecord(data) ||
    typeof data.callOi !== "number" ||
    typeof data.putOi !== "number" ||
    !Array.isArray(data.expiryData) ||
    !data.expiryData.every(
      (expiry) =>
        isRecord(expiry) &&
        typeof expiry.date === "string" &&
        typeof expiry.expiry === "string",
    ) ||
    !isOptionChainInstrument(data.indiavixData) ||
    !Array.isArray(data.optionsChain) ||
    !data.optionsChain.every(isOptionChainInstrument)
  ) {
    throw new Error("Fyers returned an invalid option-chain response");
  }

  return data;
}
