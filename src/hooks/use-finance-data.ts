import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { sourcesQuery, transactionsQuery, type Source, type Transaction } from "@/lib/data/queries";
import type { CalcTxn } from "@/lib/finance/types";

export function useFinanceData() {
  const txns = useQuery(transactionsQuery);
  const sources = useQuery(sourcesQuery);
  const sourceMap = useMemo(() => new Map<string, Source>((sources.data ?? []).map((s) => [s.id, s])), [sources.data]);
  return {
    txns: (txns.data ?? []) as Array<Transaction & CalcTxn>,
    sources: sources.data ?? [],
    sourceMap,
    isLoading: txns.isLoading || sources.isLoading,
    error: txns.error ?? sources.error,
    refetch: () => { txns.refetch(); sources.refetch(); },
  };
}
