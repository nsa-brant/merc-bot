import { useCallback } from "react";
import type { ConfirmFn, DeleteConfirmFn, ConfirmRequest, DeleteConfirmRequest } from "../lib/types.ts";

/**
 * Creates confirm/deleteConfirm callbacks that bridge tool execution
 * to React state (showing DiffView + ConfirmDialog).
 *
 * Also provides handleConfirm/handleDeny/handleDeleteConfirm/handleDeleteDeny
 * to be passed to ConfirmDialog components.
 */
export function useConfirm(
  setConfirmRequest: (req: ConfirmRequest | null) => void,
  setDeleteConfirmRequest: (req: DeleteConfirmRequest | null) => void,
  confirmRequest: ConfirmRequest | null,
  deleteConfirmRequest: DeleteConfirmRequest | null,
  cookMode: boolean = false
) {
  const confirm: ConfirmFn = useCallback(
    (filePath, oldContent, newContent) => {
      if (cookMode) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        setConfirmRequest({ filePath, oldContent, newContent, resolve });
      });
    },
    [setConfirmRequest, cookMode]
  );

  const deleteConfirm: DeleteConfirmFn = useCallback(
    (filePath) => {
      if (cookMode) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        setDeleteConfirmRequest({ filePath, resolve });
      });
    },
    [setDeleteConfirmRequest, cookMode]
  );

  const handleConfirm = useCallback(() => {
    if (confirmRequest) {
      confirmRequest.resolve(true);
      setConfirmRequest(null);
    }
  }, [confirmRequest, setConfirmRequest]);

  const handleDeny = useCallback(() => {
    if (confirmRequest) {
      confirmRequest.resolve(false);
      setConfirmRequest(null);
    }
  }, [confirmRequest, setConfirmRequest]);

  const handleDeleteConfirm = useCallback(() => {
    if (deleteConfirmRequest) {
      deleteConfirmRequest.resolve(true);
      setDeleteConfirmRequest(null);
    }
  }, [deleteConfirmRequest, setDeleteConfirmRequest]);

  const handleDeleteDeny = useCallback(() => {
    if (deleteConfirmRequest) {
      deleteConfirmRequest.resolve(false);
      setDeleteConfirmRequest(null);
    }
  }, [deleteConfirmRequest, setDeleteConfirmRequest]);

  return {
    confirm,
    deleteConfirm,
    handleConfirm,
    handleDeny,
    handleDeleteConfirm,
    handleDeleteDeny,
  };
}
