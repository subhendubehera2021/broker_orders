import {
  getLiquiditySwingHistory,
  setLiquiditySwingAnalysis,
  setLiquiditySwingDeleted,
} from "../../auto-trade-process/repositories/liquidity-swing.repository.js";

export async function getSavedLiquiditySwingHistory(_request, response) {
  try {
    const result = await getLiquiditySwingHistory(
      response.locals.liquiditySwingHistoryQuery,
    );
    response.json(result);
  } catch (error) {
    response.status(error.statusCode === 503 ? 503 : 500).json({
      error: error.statusCode === 503
        ? error.message
        : "Unable to load liquidity-swing history from Turso.",
    });
  }
}

export async function updateSavedLiquiditySwingHistory(_request, response) {
  const { id, isDeleted } = response.locals.liquiditySwingHistoryUpdate;

  try {
    const result = await setLiquiditySwingDeleted(id, isDeleted);
    if (!result) {
      response.status(404).json({ error: "Liquidity-swing history row not found." });
      return;
    }
    response.json(result);
  } catch (error) {
    response.status(error.statusCode === 503 ? 503 : 500).json({
      error: error.statusCode === 503
        ? error.message
        : "Unable to update liquidity-swing history in Turso.",
    });
  }
}

export async function updateSavedLiquiditySwingAnalysis(_request, response) {
  const { id, analysis } = response.locals.liquiditySwingAnalysisUpdate;

  try {
    const result = await setLiquiditySwingAnalysis(id, analysis);
    if (!result) {
      response.status(404).json({ error: "Liquidity-swing history row not found." });
      return;
    }
    response.json(result);
  } catch (error) {
    response.status(error.statusCode === 503 ? 503 : 500).json({
      error: error.statusCode === 503
        ? error.message
        : "Unable to update liquidity-swing analysis in Turso.",
    });
  }
}
