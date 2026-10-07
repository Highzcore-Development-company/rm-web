/**
 * Write-path stubs for the ported workspace.
 *
 * Every one of these mutates the bot's own configuration — lot size, profit
 * target, whether a proposed trade is taken. On our desk that is correct; from
 * an investor's browser it is not, so none of them is wired to anything.
 *
 * They keep highzcore's exact signatures so the ported component compiles
 * untouched, and they fail closed: the caller gets `ok: false` and a sentence
 * explaining why, rather than a silent no-op that looks like it saved.
 *
 * If per-investor settings ever become real, they belong behind a server
 * action that writes rm-server scoped to that investor's own account — not by
 * pointing these back at the shared bot config.
 */

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const READ_ONLY = "This is a read-only view of the bot. Settings are managed by Highzcore.";

export async function setLotSizeAction(
  _symbol: string,
  _lot: number | null,
): Promise<Result<number | null>> {
  return { ok: false, error: READ_ONLY };
}

export async function setCloseAtProfitAction(
  _symbol: string,
  _target: number | null,
): Promise<Result<number | null>> {
  return { ok: false, error: READ_ONLY };
}

export async function decideProposalAction(
  _id: string,
  _approved: boolean,
  _note?: string,
): Promise<Result<undefined>> {
  return { ok: false, error: READ_ONLY };
}
