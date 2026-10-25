/** Stable versioned recording format. */
export interface RecordedClick {
  type: 'click';
  selector: string;
}
export interface RecordedFill {
  type: 'fill';
  selector: string;
  value: string;
}
export interface RecordedCheck {
  type: 'check';
  selector: string;
  checked: boolean;
}
export type RecordedAction = RecordedClick | RecordedFill | RecordedCheck;

export interface NetworkFixture {
  method: string;
  path: string;
  status: number;
  contentType: string;
  body: string;
}

export interface Recording {
  version: 1;
  name: string;
  recordedAt: string;
  startUrl: string;
  actions: RecordedAction[];
  network: NetworkFixture[];
  expect?: { text: string };
  notes?: string[];
}

export interface ReplayOptions {
  baseUrl?: string;
  expectText?: string;
  headed?: boolean;
  browserPath?: string;
}
