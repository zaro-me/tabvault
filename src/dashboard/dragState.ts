// Module-level drag state shared between drag sources and drop targets.
// Using module state instead of dataTransfer.getData() during dragover because
// Firefox restricts data access during dragenter/dragover for security, and
// dataTransfer.types is a DOMStringList in Firefox (no .includes()).

/** Active tab drag: set by TabCard on dragstart, cleared on dragend. */
export const activeDrag: { current: { tabId: string; fromGroupId: string } | null } = { current: null };

/** Active group drag: set by GroupColumn handle on dragstart, cleared on dragend. */
export const activeGroupDrag: { current: string | null } = { current: null }; // groupId
