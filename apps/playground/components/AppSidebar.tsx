'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  ArrowRight,
  Code2,
  FileText,
  Image as ImageIcon,
  ImagePlus,
  MessageCircle,
  Radio,
  Video,
  Volume2,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const textExamples = [
  {
    id: 'text-generation',
    label: 'Text Generation',
    path: '/',
    icon: FileText,
  },
  {
    id: 'tool-calling',
    label: 'Tool Calling',
    path: '/tool-calling',
    icon: Wrench,
  },
  { id: 'streaming', label: 'Streaming', path: '/streaming', icon: Radio },
  {
    id: 'structured-outputs',
    label: 'Structured Outputs',
    path: '/structured-outputs',
    icon: Code2,
  },
];

const imageVideoExamples = [
  {
    id: 'image-generation',
    label: 'Image Generation',
    path: '/image-generation',
    icon: ImageIcon,
  },
  {
    id: 'video-generation',
    label: 'Video Generation',
    path: '/video-generation',
    icon: Video,
  },
  {
    id: 'media-upload',
    label: 'Media Upload',
    path: '/media-upload',
    icon: ImagePlus,
  },
];

const speechExamples = [
  {
    id: 'speech-generation',
    label: 'Speech Generation',
    path: '/speech-generation',
    icon: Volume2,
  },
];

const advancedExamples = [
  {
    id: 'chat',
    label: 'Chat',
    path: '/chat',
    icon: MessageCircle,
  },
  {
    id: 'workflow-orchestration',
    label: 'Workflow / Orchestration',
    path: '/workflow-orchestration',
    icon: Code2,
  },
  {
    id: 'agentic-tool-calling',
    label: 'Agentic Tool-Calling',
    path: '/agentic-tool-calling',
    icon: Wrench,
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className={'gap-1'}>
        <h1 className="text-xl font-bold px-2 pt-2">Playground</h1>
        <a
          href="https://github.com/pollinations/pollinations/tree/main/apps/playground"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground px-2"
        >
          <div className={'flex flex-row gap-1 items-center'}>
            GitHub
            <ArrowRight size={16} />
          </div>
        </a>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Text (Basic)</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {textExamples.map((example) => {
                const Icon = example.icon;
                const isActive =
                  example.path === '/'
                    ? pathname === '/'
                    : pathname === example.path;
                return (
                  <SidebarMenuItem key={example.id}>
                    <Link
                      href={example.path}
                      className="not-focus-visible:focus:outline-none"
                    >
                      <SidebarMenuButton isActive={isActive}>
                        <Icon className="size-4" />
                        <span>{example.label}</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Image / Video (Basic)</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {imageVideoExamples.map((example) => {
                const Icon = example.icon;
                const isActive = pathname === example.path;
                return (
                  <SidebarMenuItem key={example.id}>
                    <Link
                      href={example.path}
                      className="not-focus-visible:focus:outline-none"
                    >
                      <SidebarMenuButton isActive={isActive}>
                        <Icon className="size-4" />
                        <span>{example.label}</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Speech (Basic)</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {speechExamples.map((example) => {
                const Icon = example.icon;
                const isActive = pathname === example.path;
                return (
                  <SidebarMenuItem key={example.id}>
                    <Link
                      href={example.path}
                      className="not-focus-visible:focus:outline-none"
                    >
                      <SidebarMenuButton isActive={isActive}>
                        <Icon className="size-4" />
                        <span>{example.label}</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Advanced</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {advancedExamples.map((example) => {
                const Icon = example.icon;
                const isActive = pathname === example.path;
                return (
                  <SidebarMenuItem key={example.id}>
                    <Link
                      href={example.path}
                      className="not-focus-visible:focus:outline-none"
                    >
                      <SidebarMenuButton isActive={isActive}>
                        <Icon className="size-4" />
                        <span>{example.label}</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
