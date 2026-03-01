'use client';

import React, { createContext, useContext, useState } from 'react';

const SidebarContext = createContext({ expanded: true, setExpanded: () => { } });

export function SidebarProvider({ children }) {
    const [expanded, setExpanded] = useState(true);
    return (
        <SidebarContext.Provider value={{ expanded, setExpanded }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    return useContext(SidebarContext);
}
