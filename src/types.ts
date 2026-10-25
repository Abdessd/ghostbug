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
  /** Set only for responses captured from an --api-origin other than the recorded page's origin. */
  origin?: string;
  status: number;
  contentType: string;
  body: string;
  /** fingerprintRequest() of the redacted query string and body, used to pick the right fixture on replay. */
  match?: string;
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
  /** Non-production hostnames that replay may target besides localhost. */
  allowHosts?: string[];
  expectText?: string;
  headed?: boolean;
  browserPath?: string;
}
