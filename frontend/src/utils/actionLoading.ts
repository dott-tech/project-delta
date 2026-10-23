export const ACTION_LOADING_EVENT = 'structural-hub:action-loading';

export interface ActionLoadingEventDetail {
  active: boolean;
  requestId: number;
  label: string;
}

let actionRequestSequence = 0;

export const emitActionLoading = (detail: ActionLoadingEventDetail) => {
  window.dispatchEvent(new CustomEvent<ActionLoadingEventDetail>(ACTION_LOADING_EVENT, { detail }));
};

export const beginActionLoading = (label: string) => {
  const requestId = ++actionRequestSequence;
  emitActionLoading({ requestId, label, active: true });
  let finished = false;

  return () => {
    if (finished) return;
    finished = true;
    emitActionLoading({ requestId, label, active: false });
  };
};
