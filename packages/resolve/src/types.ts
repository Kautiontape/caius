// A resolved axis value carrying provenance (§4). The rule that fired and the
// source that justified it are mandatory — explainability is not optional.
export interface Derived {
  value: string | null;
  rule: string;
  source: string;
}
