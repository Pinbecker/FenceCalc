import type {
  AncillaryEstimateItem,
  DrawingRecord,
  EstimateGroup,
  EstimateRow,
  PricingConfigRecord,
  PricingItem,
  PricedEstimateResult
} from "@fence-estimator/contracts";

import {
  BASKETBALL_POST_BASE_MM,
  FLOODLIGHT_COLUMN_BASE_MM,
  calculateConcreteVolumeFromDimensionsMm,
  calculateFenceConcreteVolumeM3,
  calculateFloodlightConsumables
} from "./concreteRules.js";

function formatPanelItemCode(height: string): string {
  return `TWIN_BAR_PANEL_${height.replace(".", "_").replace("m", "M")}`;
}

function sortRows(rows: EstimateRow[]): EstimateRow[] {
  return rows.slice().sort((left, right) => left.itemName.localeCompare(right.itemName, "en-GB"));
}

function sumEstimatePostType(
  estimate: DrawingRecord["estimate"],
  type: "end" | "intermediate" | "corner" | "junction" | "inlineJoin"
): number {
  return Object.values(estimate.posts.byHeightAndType).reduce((sum, row) => sum + row[type], 0);
}

function countGateTypes(layout: DrawingRecord["layout"]): {
  singleLeafGates: number;
  doubleLeafGates: number;
  customGates: number;
} {
  return (layout.gates ?? []).reduce(
    (counts, gate) => {
      if (gate.gateType === "DOUBLE_LEAF") {
        counts.doubleLeafGates += 1;
        return counts;
      }
      if (gate.gateType === "CUSTOM") {
        counts.customGates += 1;
        return counts;
      }
      counts.singleLeafGates += 1;
      return counts;
    },
    {
      singleLeafGates: 0,
      doubleLeafGates: 0,
      customGates: 0
    }
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function createEstimateRow(
  pricingByCode: Map<string, PricingItem>,
  input: {
    key: string;
    itemCode: string | null;
    itemName: string;
    category: EstimateRow["category"];
    quantity: number;
    unit?: string;
    notes?: string;
    materialCost?: number;
    labourCost?: number;
  }
): EstimateRow {
  const pricingItem = input.itemCode ? pricingByCode.get(input.itemCode) ?? null : null;
  const unitMaterialCost = pricingItem ? pricingItem.materialCost : input.materialCost ?? 0;
  const unitLabourCost = pricingItem ? pricingItem.labourCost : input.labourCost ?? 0;
  const pricingNotes = [];
  if (pricingItem && !pricingItem.isActive) {
    pricingNotes.push("Pricing item is inactive.");
  }
  if (!pricingItem && input.itemCode) {
    pricingNotes.push("Pricing item is missing from configuration.");
  }
  if (input.notes) {
    pricingNotes.push(input.notes);
  }

  const quantity = roundQuantity(input.quantity);
  const totalMaterialCost = roundMoney(quantity * unitMaterialCost);
  const totalLabourCost = roundMoney(quantity * unitLabourCost);

  return {
    key: input.key,
    itemCode: input.itemCode,
    itemName: input.itemName,
    category: input.category,
    quantity,
    unit: pricingItem?.unit ?? input.unit ?? "item",
    unitMaterialCost,
    unitLabourCost,
    totalMaterialCost,
    totalLabourCost,
    totalCost: roundMoney(totalMaterialCost + totalLabourCost),
    ...(pricingNotes.length > 0 ? { notes: pricingNotes.join(" ") } : {})
  };
}

function buildGroup(key: string, title: string, rows: EstimateRow[]): EstimateGroup {
  const normalizedRows = rows.filter((row) => row.quantity > 0 || row.totalCost > 0 || row.notes);
  const subtotalMaterialCost = roundMoney(normalizedRows.reduce((sum, row) => sum + row.totalMaterialCost, 0));
  const subtotalLabourCost = roundMoney(normalizedRows.reduce((sum, row) => sum + row.totalLabourCost, 0));
  return {
    key,
    title,
    rows: normalizedRows,
    subtotalMaterialCost,
    subtotalLabourCost,
    subtotalCost: roundMoney(subtotalMaterialCost + subtotalLabourCost)
  };
}

export function buildEstimateFromDrawing(
  drawing: DrawingRecord,
  pricingConfig: PricingConfigRecord,
  ancillaryItems: AncillaryEstimateItem[] = []
): PricedEstimateResult {
  const pricingByCode = new Map(pricingConfig.items.map((item) => [item.itemCode, item] as const));
  const gateCounts = countGateTypes(drawing.layout);
  const floodlightColumnCount = drawing.layout.floodlightColumns?.length ?? 0;
  const basketballPostCount = drawing.layout.basketballPosts?.length ?? 0;
  const fenceConcreteVolumeM3 = calculateFenceConcreteVolumeM3(drawing.estimate.posts.byHeightMm);
  const floodlightConcreteVolumeM3 =
    floodlightColumnCount * calculateConcreteVolumeFromDimensionsMm(FLOODLIGHT_COLUMN_BASE_MM);
  const basketballConcreteVolumeM3 =
    basketballPostCount * calculateConcreteVolumeFromDimensionsMm(BASKETBALL_POST_BASE_MM);
  const floodlightConsumables = calculateFloodlightConsumables(floodlightColumnCount);
  const junctionAndInlineJoinCount =
    sumEstimatePostType(drawing.estimate, "junction") + sumEstimatePostType(drawing.estimate, "inlineJoin");

  const panelRows = sortRows(
    Object.entries(drawing.estimate.materials.twinBarPanelsByFenceHeight).map(([height, counts]) =>
      createEstimateRow(pricingByCode, {
        key: `panel-${height}`,
        itemCode: formatPanelItemCode(height),
        itemName: `Twin Bar panel ${height}`,
        category: "PANELS",
        quantity: counts.total
      })
    )
  );

  const postRows: EstimateRow[] = [
    createEstimateRow(pricingByCode, {
      key: "post-intermediate",
      itemCode: "TWIN_BAR_POST_INTERMEDIATE",
      itemName: "Twin Bar intermediate post",
      category: "POSTS",
      quantity: sumEstimatePostType(drawing.estimate, "intermediate")
    }),
    createEstimateRow(pricingByCode, {
      key: "post-end",
      itemCode: "TWIN_BAR_POST_END",
      itemName: "Twin Bar end post",
      category: "POSTS",
      quantity: sumEstimatePostType(drawing.estimate, "end")
    }),
    createEstimateRow(pricingByCode, {
      key: "post-corner-internal",
      itemCode: "TWIN_BAR_POST_CORNER_INTERNAL",
      itemName: "Twin Bar corner post internal",
      category: "POSTS",
      quantity: drawing.estimate.corners.internal
    }),
    createEstimateRow(pricingByCode, {
      key: "post-corner-external",
      itemCode: "TWIN_BAR_POST_CORNER_EXTERNAL",
      itemName: "Twin Bar corner post external",
      category: "POSTS",
      quantity: drawing.estimate.corners.external
    })
  ];

  if (junctionAndInlineJoinCount > 0) {
    postRows.push(
      createEstimateRow(pricingByCode, {
        key: "post-unmapped-terminal",
        itemCode: null,
        itemName: "Inline join / junction posts",
        category: "POSTS",
        quantity: junctionAndInlineJoinCount,
        unit: "post",
        notes: "Pricing rule is still provisional for inline joins and junction posts."
      })
    );
  }

  if (drawing.estimate.corners.unclassified > 0) {
    postRows.push(
      createEstimateRow(pricingByCode, {
        key: "post-unclassified-corners",
        itemCode: null,
        itemName: "Unclassified corner posts",
        category: "POSTS",
        quantity: drawing.estimate.corners.unclassified,
        unit: "post",
        notes: "Corner classification remains unclassified for this layout and needs review."
      })
    );
  }

  const gateRows: EstimateRow[] = [
    createEstimateRow(pricingByCode, {
      key: "gate-single-leaf",
      itemCode: "TWIN_BAR_GATE_SINGLE_LEAF_LEAF",
      itemName: "Single leaf gate leaf",
      category: "GATES",
      quantity: gateCounts.singleLeafGates
    }),
    createEstimateRow(pricingByCode, {
      key: "gate-single-posts",
      itemCode: "TWIN_BAR_GATE_SINGLE_LEAF_POSTS",
      itemName: "Single leaf gate posts",
      category: "GATES",
      quantity: gateCounts.singleLeafGates
    }),
    createEstimateRow(pricingByCode, {
      key: "gate-double-leaves",
      itemCode: "TWIN_BAR_GATE_DOUBLE_LEAF_LEAVES",
      itemName: "Double leaf gate leaves",
      category: "GATES",
      quantity: gateCounts.doubleLeafGates * 2
    }),
    createEstimateRow(pricingByCode, {
      key: "gate-double-posts",
      itemCode: "TWIN_BAR_GATE_DOUBLE_LEAF_POSTS",
      itemName: "Double leaf gate posts",
      category: "GATES",
      quantity: gateCounts.doubleLeafGates
    })
  ];

  if (gateCounts.customGates > 0) {
    gateRows.push(
      createEstimateRow(pricingByCode, {
        key: "gate-custom",
        itemCode: null,
        itemName: "Custom gates",
        category: "GATES",
        quantity: gateCounts.customGates,
        unit: "gate",
        notes: "Custom gate pricing logic is not finalised yet."
      })
    );
  }

  const concreteRows = [
    createEstimateRow(pricingByCode, {
      key: "concrete-fence",
      itemCode: "TWIN_BAR_FENCE_CONCRETE",
      itemName: "Twin Bar fence concrete",
      category: "CONCRETE",
      quantity: fenceConcreteVolumeM3,
      unit: "m3",
      notes: "Derived from fence post counts by height."
    })
  ];

  const floodlightRows = [
    createEstimateRow(pricingByCode, {
      key: "floodlight-column",
      itemCode: "TWIN_BAR_FLOODLIGHT_COLUMN",
      itemName: "Floodlight column",
      category: "FLOODLIGHT_COLUMNS",
      quantity: floodlightColumnCount
    }),
    createEstimateRow(pricingByCode, {
      key: "floodlight-concrete",
      itemCode: "TWIN_BAR_FLOODLIGHT_COLUMN_CONCRETE",
      itemName: "Floodlight column concrete",
      category: "FLOODLIGHT_COLUMNS",
      quantity: floodlightConcreteVolumeM3,
      unit: "m3"
    }),
    createEstimateRow(pricingByCode, {
      key: "floodlight-bolts",
      itemCode: "TWIN_BAR_FLOODLIGHT_COLUMN_BOLTS",
      itemName: "Floodlight column bolts",
      category: "FLOODLIGHT_COLUMNS",
      quantity: floodlightConsumables.bolts
    }),
    createEstimateRow(pricingByCode, {
      key: "floodlight-chemfix",
      itemCode: "TWIN_BAR_FLOODLIGHT_COLUMN_CHEMFIX",
      itemName: "Floodlight column chemfix",
      category: "FLOODLIGHT_COLUMNS",
      quantity: floodlightConsumables.chemfixTubes
    })
  ];

  const basketballRows = [
    createEstimateRow(pricingByCode, {
      key: "basketball-post",
      itemCode: "TWIN_BAR_BASKETBALL_POST",
      itemName: "Basketball post",
      category: "BASKETBALL_POSTS",
      quantity: basketballPostCount
    }),
    createEstimateRow(pricingByCode, {
      key: "basketball-concrete",
      itemCode: "TWIN_BAR_BASKETBALL_POST_CONCRETE",
      itemName: "Basketball post concrete",
      category: "BASKETBALL_POSTS",
      quantity: basketballConcreteVolumeM3,
      unit: "m3"
    })
  ];

  const fixingRows = [
    createEstimateRow(pricingByCode, {
      key: "fixing-nuts",
      itemCode: "TWIN_BAR_FIXING_NUT",
      itemName: "Nuts",
      category: "FIXINGS",
      quantity: 0,
      notes: "Quantity rule to be defined later."
    }),
    createEstimateRow(pricingByCode, {
      key: "fixing-bolts",
      itemCode: "TWIN_BAR_FIXING_BOLT",
      itemName: "Bolts",
      category: "FIXINGS",
      quantity: 0,
      notes: "Quantity rule to be defined later."
    }),
    createEstimateRow(pricingByCode, {
      key: "fixing-washers",
      itemCode: "TWIN_BAR_FIXING_WASHER",
      itemName: "Washers",
      category: "FIXINGS",
      quantity: 0,
      notes: "Quantity rule to be defined later."
    })
  ];

  const plantRows = [
    createEstimateRow(pricingByCode, {
      key: "plant-general",
      itemCode: "TWIN_BAR_GENERAL_PLANT",
      itemName: "General plant",
      category: "PLANT",
      quantity: drawing.layout.segments.length > 0 ? 1 : 0
    })
  ];

  const ancillaryRows = ancillaryItems.map((item) =>
    createEstimateRow(pricingByCode, {
      key: item.id,
      itemCode: null,
      itemName: item.description,
      category: "ANCILLARY",
      quantity: item.quantity,
      materialCost: item.materialCost,
      labourCost: item.labourCost,
      unit: "item"
    })
  );

  const groups = [
    buildGroup("panels", "Panels", panelRows),
    buildGroup("posts", "Posts", postRows),
    buildGroup("gates", "Gates", gateRows),
    buildGroup("concrete", "Concrete", concreteRows),
    buildGroup("floodlight-columns", "Floodlight columns", floodlightRows),
    buildGroup("basketball-posts", "Basketball posts", basketballRows),
    buildGroup("fixings", "Fixings", fixingRows),
    buildGroup("plant", "Plant", plantRows),
    buildGroup("ancillary-items", "Ancillary items", ancillaryRows)
  ].filter((group) => group.rows.length > 0);

  const materialCost = roundMoney(groups.reduce((sum, group) => sum + group.subtotalMaterialCost, 0));
  const labourCost = roundMoney(groups.reduce((sum, group) => sum + group.subtotalLabourCost, 0));

  return {
    drawing: {
      drawingId: drawing.id,
      drawingName: drawing.name,
      customerName: drawing.customerName
    },
    groups,
    ancillaryItems,
    totals: {
      materialCost,
      labourCost,
      totalCost: roundMoney(materialCost + labourCost)
    }
  };
}
