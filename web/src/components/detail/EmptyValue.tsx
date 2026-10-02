import { Box, Typography } from '@mui/material';

export interface EmptyValueProps {
  message?: string;
}

/**
 * 空态组件
 * Use this page to在详情页中显示空值占位符
 */
export const EmptyValue = ({ message = 'No data available' }: EmptyValueProps) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 0.5,
      color: 'text.disabled',
      fontStyle: 'italic',
      fontSize: '0.85rem',
    }}
  >
    <Typography variant="body2" sx={{ opacity: 0.6 }}>
      {message}
    </Typography>
  </Box>
);

export default EmptyValue;
