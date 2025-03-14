import type { ReactNode } from 'react'

import { Separator } from '@mindworld/ui/components/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@mindworld/ui/components/sidebar'

import { AppSidebar } from '@/components/app-sidebar'
import { RememberWorkspace } from '@/components/remember-workspace'
import { WorkspaceBreadcrumb } from '@/components/workspace-breadcrumb'

export default async function WorkspaceLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode
  params: Promise<{ workspaceId: string }>
}>) {
  const { workspaceId } = await params

  return (
    <SidebarProvider>
      <AppSidebar workspaceId={workspaceId} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <WorkspaceBreadcrumb />
          </div>
        </header>
        <RememberWorkspace id={workspaceId} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
