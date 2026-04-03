export type InboundPayloadErrorSnapshot = {
  httpMethod: string;
  path: string;
  payload: unknown;
  errorName: string;
  errorMessage: string;
  errorStack: string | null;
};
