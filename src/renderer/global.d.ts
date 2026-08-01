import type { DeskcatApi } from '../shared/types';

declare global {
  interface Window {
    deskcat: DeskcatApi;
  }
}

export {};
