import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

// Base spinner component
export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6', 
    lg: 'h-8 w-8',
    xl: 'h-12 w-12'
  };

  return (
    <Loader2 
      className={cn(
        'animate-spin text-primary', 
        sizeClasses[size], 
        className
      )} 
    />
  );
};

// Full page loading component
export interface PageLoadingProps {
  message?: string;
  className?: string;
}

export const PageLoading: React.FC<PageLoadingProps> = ({ 
  message = 'Loading...', 
  className 
}) => {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center min-h-64 p-8', 
      className
    )}>
      <Spinner size="lg" className="mb-4" />
      <p className="text-muted-foreground text-center">{message}</p>
    </div>
  );
};

// Inline loading component
export interface InlineLoadingProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const InlineLoading: React.FC<InlineLoadingProps> = ({ 
  message, 
  size = 'sm',
  className 
}) => {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Spinner size={size} />
      {message && <span className="text-muted-foreground">{message}</span>}
    </div>
  );
};

// Button loading state
export interface LoadingButtonProps {
  loading?: boolean;
  children: React.ReactNode;
  loadingText?: string;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  loading = false,
  children,
  loadingText,
  className,
  disabled,
  onClick,
  type = 'button',
  variant = 'default'
}) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      className={cn(
        // Base button styles - matching your existing Button component
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background',
        
        // Variant styles
        {
          'bg-primary text-primary-foreground hover:bg-primary/90 h-10 py-2 px-4': variant === 'default',
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 py-2 px-4': variant === 'destructive',
          'border border-input hover:bg-accent hover:text-accent-foreground h-10 py-2 px-4': variant === 'outline',
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 py-2 px-4': variant === 'secondary',
          'hover:bg-accent hover:text-accent-foreground h-10 py-2 px-4': variant === 'ghost',
          'underline-offset-4 hover:underline text-primary h-10 py-2 px-4': variant === 'link',
        },
        
        className
      )}
    >
      {loading && <Spinner size="sm" className="mr-2" />}
      {loading ? (loadingText || 'Loading...') : children}
    </button>
  );
};

// Skeleton loading components
export interface SkeletonProps {
  className?: string;
  height?: string;
  width?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ 
  className, 
  height = 'h-4', 
  width = 'w-full' 
}) => {
  return (
    <div 
      className={cn(
        'animate-pulse bg-muted rounded', 
        height, 
        width, 
        className
      )} 
    />
  );
};

// Schedule-specific loading skeletons
export const ScheduleCardSkeleton: React.FC = () => {
  return (
    <div className="border rounded-lg p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <Skeleton height="h-6" width="w-48" />
          <Skeleton height="h-4" width="w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton height="h-8" width="w-16" />
          <Skeleton height="h-8" width="w-16" />
        </div>
      </div>
      <div className="flex gap-4 text-sm">
        <Skeleton height="h-4" width="w-24" />
        <Skeleton height="h-4" width="w-20" />
      </div>
    </div>
  );
};

export const ScheduleGridSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      <Skeleton height="h-8" width="w-64" />
      
      {/* Table header */}
      <div className="grid grid-cols-8 gap-2 p-3 border rounded-t-lg">
        <Skeleton height="h-4" width="w-full" />
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} height="h-4" width="w-16" />
        ))}
      </div>
      
      {/* Table rows */}
      {Array.from({ length: 8 }).map((_, rowIndex) => (
        <div key={rowIndex} className="grid grid-cols-8 gap-2 p-3 border-x border-b">
          <Skeleton height="h-4" width="w-20" />
          {Array.from({ length: 7 }).map((_, colIndex) => (
            <Skeleton key={colIndex} height="h-8" width="w-full" />
          ))}
        </div>
      ))}
    </div>
  );
};

export const CastMemberSkeleton: React.FC = () => {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-center">
        <Skeleton height="h-5" width="w-32" />
        <Skeleton height="h-8" width="w-16" />
      </div>
      <div className="space-y-2">
        <Skeleton height="h-3" width="w-24" />
        <div className="flex gap-2">
          <Skeleton height="h-6" width="w-16" />
          <Skeleton height="h-6" width="w-16" />
          <Skeleton height="h-6" width="w-16" />
        </div>
      </div>
    </div>
  );
};

// Error fallback component
export interface ErrorFallbackProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  message = 'Something went wrong',
  onRetry,
  className
}) => {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center min-h-64 p-8 text-center', 
      className
    )}>
      <div className="text-destructive mb-4">
        <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.728-.833-2.498 0L4.232 15.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-destructive mb-2">Error</h3>
      <p className="text-muted-foreground mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-md transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
};