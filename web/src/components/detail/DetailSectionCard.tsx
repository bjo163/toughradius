import { ReactNode } from 'react';
import { Box, Card, CardContent, Typography, alpha } from '@mui/material';

export interface DetailSectionCardProps {
  title: string;
  description?: string;
  icon: ReactNode;
  children: ReactNode;
  color?: 'primary' | 'success' | 'warning' | 'info' | 'error';
}

/**
 * 详情分区卡片组件
 * Use this page to在详情页中将相关字段分组展示，带有图标和颜色主题
 */
export const DetailSectionCard = ({
  title,
  description,
  icon,
  children,
  color = 'primary',
}: DetailSectionCardProps) => (
  <Card
    elevation={0}
    sx={{
      borderRadius: 0.5,
      border: theme => `1px solid ${theme.palette.text.primary}`,
      boxShadow: theme => `2px 2px 0 ${theme.palette.text.primary}`,
      overflow: 'hidden',
      transition: 'all 0.2s ease',
      '&:hover': {
        transform: 'translate(-1px, -1px)',
        boxShadow: theme => `3px 3px 0 ${theme.palette.text.primary}`,
      },
    }}
  >
    <Box
      sx={{
        px: 2.5,
        py: 2,
        backgroundColor: theme =>
          alpha(
            theme.palette[color].main,
            theme.palette.mode === 'dark' ? 0.15 : 0.06
          ),
        borderBottom: theme =>
          `2px solid ${alpha(theme.palette[color].main, 0.45)}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 0.5,
            border: theme => `1px solid ${theme.palette.text.primary}`,
            backgroundColor: theme =>
              alpha(theme.palette[color].main, theme.palette.mode === 'dark' ? 0.3 : 0.15),
            color: `${color}.main`,
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 600,
              color: `${color}.main`,
              fontSize: '1.1rem',
            }}
          >
            {title}
          </Typography>
          {description && (
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                fontSize: '0.9rem',
                mt: 0.25,
              }}
            >
              {description}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
    <CardContent sx={{ p: 2.5 }}>{children}</CardContent>
  </Card>
);

export default DetailSectionCard;
