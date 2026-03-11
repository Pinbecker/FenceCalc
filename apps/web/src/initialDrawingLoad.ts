interface InitialDrawingLoadOptions {
  requestedDrawingId: string | null;
  currentDrawingId: string | null;
  lastRequestedDrawingId: string | null;
  hasSession: boolean;
  isRestoringSession: boolean;
}

export function shouldLoadInitialDrawing(options: InitialDrawingLoadOptions): boolean {
  if (!options.requestedDrawingId || options.isRestoringSession || !options.hasSession) {
    return false;
  }

  if (options.currentDrawingId === options.requestedDrawingId) {
    return false;
  }

  return options.lastRequestedDrawingId !== options.requestedDrawingId;
}
