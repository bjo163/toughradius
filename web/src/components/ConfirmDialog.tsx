import { useCallback } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useTranslate } from 'react-admin';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  content?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
  isDelete?: boolean;
  loading?: boolean;
}

/**
 * ConfirmDialog displays a confirmation dialog before performing destructive actions.
 * Use this component for delete operations, bulk actions, or any operation that needs user confirmation.
 * 
 * @param open - Whether the dialog is open
 * @param onClose - Function to call when the dialog should close
 * @param onConfirm - Function to call when the user confirms the action
 * @param title - Dialog title
 * @param content - Dialog content/message
 * @param confirmLabel - Label for the confirm button
 * @param cancelLabel - Label for the cancel button
 * @param confirmColor - Color for the confirm button
 * @param isDelete - Whether this is a delete operation (shows delete icon)
 * @param loading - Whether the confirm action is in progress
 */
export const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  content,
  confirmLabel,
  cancelLabel,
  confirmColor = 'error',
  isDelete = false,
  loading = false,
}: ConfirmDialogProps) => {
  const translate = useTranslate();

  const handleConfirm = useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  const defaultTitle = isDelete
    ? translate('confirm.delete_title', { _: 'ConfirmDelete' })
    : translate('confirm.title', { _: 'Confirm action' });

  const defaultContent = isDelete
    ? translate('confirm.delete_message', { _: 'Are you sure you want to delete this item? This action cannot be undone.' })
    : translate('confirm.message', { _: 'Are you sure you want to perform this action?' });

  const defaultConfirmLabel = isDelete
    ? translate('confirm.delete', { _: 'Delete' })
    : translate('confirm.confirm', { _: 'Confirm' });

  const defaultCancelLabel = translate('confirm.cancel', { _: 'Cancel' });

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle
        id="confirm-dialog-title"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          color: isDelete ? 'error.main' : 'warning.main',
        }}
      >
        {isDelete ? (
          <DeleteIcon color="error" />
        ) : (
          <WarningIcon color="warning" />
        )}
        {title || defaultTitle}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="confirm-dialog-description">
          {content || defaultContent}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={onClose}
          disabled={loading}
          variant="outlined"
          color="inherit"
        >
          {cancelLabel || defaultCancelLabel}
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={loading}
          variant="contained"
          color={confirmColor}
          startIcon={isDelete ? <DeleteIcon /> : undefined}
          autoFocus
        >
          {loading
            ? translate('confirm.processing', { _: 'Processing...' })
            : confirmLabel || defaultConfirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/**
 * Hook to manage confirm dialog state
 */
export const useConfirmDialog = () => {
  const [open, setOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<(() => void) | null>(null);

  const showConfirm = useCallback((action: () => void) => {
    setPendingAction(() => action);
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setPendingAction(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (pendingAction) {
      pendingAction();
    }
    setOpen(false);
    setPendingAction(null);
  }, [pendingAction]);

  return {
    open,
    showConfirm,
    handleClose,
    handleConfirm,
  };
};

import React from 'react';

export default ConfirmDialog;
