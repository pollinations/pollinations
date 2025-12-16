import React from 'react';
import { cn } from '../../utils';

interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
    direction?: 'row' | 'column';
}

export const ButtonGroup: React.FC<ButtonGroupProps> = ({ direction = 'row', className, children, ...props }) => {
    const directionClass = direction === 'row' ? 'flex-row' : 'flex-col';
    return (
        <div className={cn('flex gap-3', directionClass, className)} {...props}>
            {children}
        </div>
    );
};
