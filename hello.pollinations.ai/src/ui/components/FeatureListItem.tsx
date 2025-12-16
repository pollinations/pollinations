import React from 'react';
import { cn } from '../../utils';

interface FeatureListItemProps extends React.HTMLAttributes<HTMLDivElement> {
    icon?: React.ReactNode;
    title: string;
    description: string;
}

export const FeatureListItem: React.FC<FeatureListItemProps> = ({ icon, title, description, className, ...props }) => {
    return (
        <div className={cn('flex items-start space-x-4', className)} {...props}>
            {icon && <div className="flex-shrink-0 text-brand-primary mt-1">{icon}</div>}
            <div>
                <h3 className="text-lg font-semibold text-text-body-main">{title}</h3>
                <p className="text-text-body-secondary mt-1">{description}</p>
            </div>
        </div>
    );
};
