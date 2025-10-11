import type { FC, ReactNode } from "react";

type HeaderProps = {
    children: ReactNode;
};

export const Header: FC<HeaderProps> = ({ children }) => {
    return (
        <div className="flex flex-col sm:flex-row justify-between gap-4 sm:items-center">
            <img 
                src="/logo_text_black.svg" 
                alt="pollinations.ai" 
                className="h-12 w-full sm:w-auto sm:flex-1 object-contain object-center sm:object-left" 
            />
            <div className="flex gap-4 items-center justify-between sm:justify-end">
                {children}
            </div>
        </div>
    );
};
