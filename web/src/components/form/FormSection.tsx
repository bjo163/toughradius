import { ReactNode } from 'react';
import { Box, Paper, Typography } from '@mui/material';

export interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * 表单分区组件
 * Use this page to将表单内容分组并添加标题和描述
 */
export const FormSection = ({ title, description, children }: FormSectionProps) => (
  <Paper
    elevation={0}
    sx={{
      p: { xs: 1.5, sm: 2 },
      mb: 2,
      borderRadius: 0.5,
      border: theme => `1px solid ${theme.palette.text.primary}`,
      borderLeft: theme => `4px solid ${theme.palette.primary.main}`,
      boxShadow: theme => `2px 2px 0 ${theme.palette.text.primary}`,
      backgroundColor: theme => theme.palette.background.paper,
      width: '100%'
    }}
  >
    <Typography variant="subtitle1" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.035em' }}>
      {title}
    </Typography>
    {description && (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1 }}>
        {description}
      </Typography>
    )}
    <Box sx={{ mt: 2, width: '100%' }}>
      {children}
    </Box>
  </Paper>
);

export default FormSection;
