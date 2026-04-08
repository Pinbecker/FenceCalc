import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type {
  AncillaryEstimateItem,
  AuthSessionEnvelope,
  CompanyUserRecord,
  DrawingRecord,
  DrawingSummary,
  DrawingWorkspaceRecord,
  EstimateWorkbookManualEntry,
  PricedEstimateResult,
  QuoteRecord,
} from "@fence-estimator/contracts";

import { exportQuotePdfReport } from "../drawingPdfReport";
import {
  createDrawingWorkspaceQuoteSnapshot,
  getDrawing,
  getDrawingWorkspaceEstimate,
  updateDrawingWorkspace,
} from "../apiClient";
import { getRevisionLabel } from "../drawingWorkspace";
import { mergeEstimateWorkbook } from "../estimatingWorkbook";
import { buildEstimateDisplaySections } from "../workbookPresentation";
import {
  buildAncillaryItem,
  buildCommercialInputs,
  buildInitialManualEntries,
  EMPTY_LAYOUT,
  serializeCommercialInputs,
  upsertManualEntry,
} from "./shared";

interface UseWorkspaceEstimateOptions {
  workspace: DrawingWorkspaceRecord | null;
  setWorkspace: Dispatch<SetStateAction<DrawingWorkspaceRecord | null>>;
  activeDrawing: DrawingSummary | null;
  activeRootDrawing: DrawingSummary | null;
  customerName: string;
  isEstimateVisible: boolean;
  session: AuthSessionEnvelope;
  users: CompanyUserRecord[];
  refreshWorkspaces: () => Promise<void>;
  setQuotes: Dispatch<SetStateAction<QuoteRecord[]>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setNoticeMessage: Dispatch<SetStateAction<string | null>>;
}

function mapPdfSections(sections: ReturnType<typeof buildEstimateDisplaySections>) {
  return sections.map((section) => ({
    title: section.title,
    subtotal: section.subtotal,
    rows: section.rows.map((row) => ({
      label: row.label,
      unit: row.unit,
      quantity: row.quantity,
      rate: row.rate,
      total: row.total,
    })),
  }));
}

export interface UseWorkspaceEstimateResult {
  activeDrawingRecord: DrawingRecord | null;
  isLoadingEstimate: boolean;
  isSavingControls: boolean;
  isSavingQuote: boolean;
  pricedEstimate: PricedEstimateResult | null;
  workbook: PricedEstimateResult["workbook"] | null;
  ancillaryItems: AncillaryEstimateItem[];
  materialSections: ReturnType<typeof buildEstimateDisplaySections>;
  labourSections: ReturnType<typeof buildEstimateDisplaySections>;
  externalCornersEnabled: boolean;
  handleAddAncillaryItem: () => void;
  handleUpdateAncillaryItem: (
    itemId: string,
    field: "description" | "quantity" | "materialCost" | "labourCost",
    value: string | number,
  ) => void;
  handleRemoveAncillaryItem: (itemId: string) => void;
  handleManualEntryChange: (code: string, quantity: number) => void;
  handleExternalCornersEnabledChange: (enabled: boolean) => Promise<void>;
  handleGenerateQuotePdf: () => Promise<void>;
  handleOpenSavedQuotePdf: (quote: QuoteRecord) => void;
}

export function useWorkspaceEstimate({
  workspace,
  setWorkspace,
  activeDrawing,
  activeRootDrawing,
  customerName,
  isEstimateVisible,
  session,
  users,
  refreshWorkspaces,
  setQuotes,
  setErrorMessage,
  setNoticeMessage,
}: UseWorkspaceEstimateOptions): UseWorkspaceEstimateResult {
  const [activeDrawingRecord, setActiveDrawingRecord] = useState<DrawingRecord | null>(null);
  const [basePricedEstimate, setBasePricedEstimate] = useState<PricedEstimateResult | null>(null);
  const [ancillaryItems, setAncillaryItems] = useState<AncillaryEstimateItem[]>([]);
  const [manualEntries, setManualEntries] = useState<EstimateWorkbookManualEntry[]>([]);
  const [isLoadingEstimate, setIsLoadingEstimate] = useState(false);
  const [isSavingControls, setIsSavingControls] = useState(false);
  const [isSavingQuote, setIsSavingQuote] = useState(false);
  const latestCommercialSaveRequestRef = useRef(0);

  const pricedEstimate = useMemo(() => {
    if (!basePricedEstimate) {
      return null;
    }
    return mergeEstimateWorkbook(basePricedEstimate, ancillaryItems, manualEntries);
  }, [ancillaryItems, basePricedEstimate, manualEntries]);

  const workbook = pricedEstimate?.workbook ?? null;
  const externalCornersEnabled = workspace?.commercialInputs.externalCornersEnabled ?? true;
  const commercialInputs = useMemo(
    () => buildCommercialInputs(pricedEstimate, workspace?.commercialInputs ?? null),
    [pricedEstimate, workspace?.commercialInputs],
  );
  const commercialInputsKey = useMemo(
    () => serializeCommercialInputs(commercialInputs),
    [commercialInputs],
  );
  const workspaceCommercialInputsKey = useMemo(
    () => serializeCommercialInputs(workspace?.commercialInputs ?? null),
    [workspace?.commercialInputs],
  );
  const materialSections = useMemo(
    () =>
      activeDrawingRecord && workbook ? buildEstimateDisplaySections(workbook, "MATERIALS") : [],
    [activeDrawingRecord, workbook],
  );
  const labourSections = useMemo(
    () =>
      activeDrawingRecord && workbook ? buildEstimateDisplaySections(workbook, "LABOUR") : [],
    [activeDrawingRecord, workbook],
  );

  useEffect(() => {
    if (!workspace?.id || !activeDrawing || !isEstimateVisible) {
      setBasePricedEstimate(null);
      setActiveDrawingRecord(null);
      setAncillaryItems([]);
      setManualEntries([]);
      setIsLoadingEstimate(false);
      return;
    }

    let cancelled = false;
    setIsLoadingEstimate(true);
    void (async () => {
      try {
        const [nextEstimate, nextDrawingRecord] = await Promise.all([
          getDrawingWorkspaceEstimate(workspace.id, activeDrawing.id),
          getDrawing(activeDrawing.id),
        ]);
        if (cancelled) {
          return;
        }
        setBasePricedEstimate(nextEstimate);
        setActiveDrawingRecord(nextDrawingRecord);
        setAncillaryItems([]);
        setManualEntries(buildInitialManualEntries(nextEstimate));
      } catch (error) {
        if (!cancelled) {
          setBasePricedEstimate(null);
          setActiveDrawingRecord(null);
          setErrorMessage((error as Error).message);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingEstimate(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeDrawing, isEstimateVisible, setErrorMessage, workspace?.id]);

  useEffect(() => {
    if (!workspace?.id || !commercialInputs) {
      return;
    }
    if (commercialInputsKey === workspaceCommercialInputsKey) {
      return;
    }

    const timer = globalThis.setTimeout(() => {
      const requestId = latestCommercialSaveRequestRef.current + 1;
      latestCommercialSaveRequestRef.current = requestId;
      setIsSavingControls(true);
      void (async () => {
        try {
          const updated = await updateDrawingWorkspace(workspace.id, { commercialInputs });
          if (latestCommercialSaveRequestRef.current !== requestId) {
            return;
          }
          setWorkspace(updated);
        } catch (error) {
          if (latestCommercialSaveRequestRef.current !== requestId) {
            return;
          }
          setErrorMessage((error as Error).message);
        } finally {
          if (latestCommercialSaveRequestRef.current === requestId) {
            setIsSavingControls(false);
          }
        }
      })();
    }, 600);

    return () => globalThis.clearTimeout(timer);
  }, [
    commercialInputsKey,
    setErrorMessage,
    setWorkspace,
    workspace?.id,
    workspaceCommercialInputsKey,
  ]);

  const handleAddAncillaryItem = useCallback(() => {
    setAncillaryItems((current) => [...current, buildAncillaryItem()]);
  }, []);

  const handleUpdateAncillaryItem = useCallback(
    (
      itemId: string,
      field: "description" | "quantity" | "materialCost" | "labourCost",
      value: string | number,
    ) => {
      setAncillaryItems((current) =>
        current.map((entry) => (entry.id === itemId ? { ...entry, [field]: value } : entry)),
      );
    },
    [],
  );

  const handleRemoveAncillaryItem = useCallback((itemId: string) => {
    setAncillaryItems((current) => current.filter((entry) => entry.id !== itemId));
  }, []);

  const handleManualEntryChange = useCallback((code: string, quantity: number) => {
    setManualEntries((current) => upsertManualEntry(current, code, quantity));
  }, []);

  const handleExternalCornersEnabledChange = useCallback(
    async (enabled: boolean) => {
      if (!workspace?.id) {
        return;
      }
      const nextCommercialInputs = {
        ...(commercialInputs ?? workspace.commercialInputs),
        externalCornersEnabled: enabled,
      };
      setIsSavingControls(true);
      setErrorMessage(null);
      try {
        const updated = await updateDrawingWorkspace(workspace.id, {
          commercialInputs: nextCommercialInputs,
        });
        setWorkspace(updated);
        if (activeDrawing && isEstimateVisible) {
          setBasePricedEstimate(await getDrawingWorkspaceEstimate(workspace.id, activeDrawing.id));
        }
      } catch (error) {
        setErrorMessage((error as Error).message);
      } finally {
        setIsSavingControls(false);
      }
    },
    [
      activeDrawing,
      commercialInputs,
      isEstimateVisible,
      setErrorMessage,
      setWorkspace,
      workspace,
    ],
  );

  const handleGenerateQuotePdf = useCallback(async () => {
    if (!workspace || !activeDrawing || !activeDrawingRecord || !pricedEstimate) {
      return;
    }

    setIsSavingQuote(true);
    setErrorMessage(null);
    try {
      const quote = await createDrawingWorkspaceQuoteSnapshot(
        workspace.id,
        ancillaryItems,
        manualEntries,
        activeDrawing.id,
      );
      setQuotes((current) => [quote, ...current]);
      await refreshWorkspaces();

      const layout = activeDrawingRecord.layout ?? EMPTY_LAYOUT;
      const estimateSegments = layout.segments ?? [];
      const segmentOrdinalById = new Map(
        estimateSegments.map((segment, index) => [segment.id, index + 1]),
      );
      const opened = exportQuotePdfReport({
        companyName: session.company.name ?? null,
        preparedBy: session.user.displayName ?? null,
        customerName,
        jobName: activeRootDrawing?.name ?? workspace.name,
        drawingName: activeDrawing.name,
        revisionLabel: getRevisionLabel(activeDrawing),
        generatedAtIso: new Date().toISOString(),
        layout,
        materialSections: mapPdfSections(materialSections),
        labourSections: mapPdfSections(labourSections),
        totals: pricedEstimate.totals,
        warnings: pricedEstimate.warnings,
        estimateSegments,
        segmentOrdinalById,
      });

      if (!opened) {
        setErrorMessage(
          "Could not open quote PDF. Please allow pop-ups for this site and try again.",
        );
      } else {
        setNoticeMessage("Quote saved and PDF generated.");
      }
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSavingQuote(false);
    }
  }, [
    activeDrawing,
    activeDrawingRecord,
    activeRootDrawing?.name,
    ancillaryItems,
    customerName,
    labourSections,
    manualEntries,
    materialSections,
    pricedEstimate,
    refreshWorkspaces,
    session.company.name,
    session.user.displayName,
    setErrorMessage,
    setNoticeMessage,
    setQuotes,
    workspace,
  ]);

  const handleOpenSavedQuotePdf = useCallback(
    (quote: QuoteRecord) => {
      const quoteWorkbook = quote.pricedEstimate.workbook;
      if (!quoteWorkbook) {
        setErrorMessage(
          "This quote snapshot cannot be opened because its workbook data is unavailable.",
        );
        return;
      }

      const layout = quote.drawingSnapshot.layout ?? EMPTY_LAYOUT;
      const estimateSegments = layout.segments ?? [];
      const segmentOrdinalById = new Map(
        estimateSegments.map((segment, index) => [segment.id, index + 1]),
      );
      const preparedBy =
        users.find((user) => user.id === quote.createdByUserId)?.displayName ??
        session.user.displayName ??
        null;
      const opened = exportQuotePdfReport({
        companyName: session.company.name ?? null,
        preparedBy,
        customerName: quote.drawingSnapshot.customerName,
        jobName: activeRootDrawing?.name ?? workspace?.name ?? quote.drawingSnapshot.drawingName,
        drawingName: quote.drawingSnapshot.drawingName,
        revisionLabel: getRevisionLabel({
          revisionNumber: quote.drawingSnapshot.revisionNumber ?? 0,
        }),
        generatedAtIso: quote.createdAtIso,
        layout,
        materialSections: mapPdfSections(buildEstimateDisplaySections(quoteWorkbook, "MATERIALS")),
        labourSections: mapPdfSections(buildEstimateDisplaySections(quoteWorkbook, "LABOUR")),
        totals: quote.pricedEstimate.totals,
        warnings: quote.pricedEstimate.warnings,
        estimateSegments,
        segmentOrdinalById,
      });

      if (!opened) {
        setErrorMessage(
          "Could not open quote PDF. Please allow pop-ups for this site and try again.",
        );
      }
    },
    [activeRootDrawing?.name, session.company.name, session.user.displayName, setErrorMessage, users, workspace?.name],
  );

  return {
    activeDrawingRecord,
    isLoadingEstimate,
    isSavingControls,
    isSavingQuote,
    pricedEstimate,
    workbook,
    ancillaryItems,
    materialSections,
    labourSections,
    externalCornersEnabled,
    handleAddAncillaryItem,
    handleUpdateAncillaryItem,
    handleRemoveAncillaryItem,
    handleManualEntryChange,
    handleExternalCornersEnabledChange,
    handleGenerateQuotePdf,
    handleOpenSavedQuotePdf,
  };
}
