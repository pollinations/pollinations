import React from 'react';
import { cn } from '../../utils';

interface SectionWrapperProps extends React.HTMLAttributes<HTMLDivElement> {
    spacing?: 'default' | 'comfortable' | 'none';
}

export const SectionWrapper = React.forwardRef<HTMLDivElement, SectionWrapperProps>(
    ({ className, spacing = 'default', children, ...props }, ref) => {
        const spacingClass = {
            default: 'mb-12',
            comfortable: 'mb-16',
            none: 'mb-0',
        }[spacing];

        return (
            <div ref={ref} className={cn(spacingClass, className)} {...props}>
                {children}
            </div>
        );
    }
);
SectionWrapper.displayName = 'SectionWrapper';
