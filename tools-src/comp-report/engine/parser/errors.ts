// What every parser reports: warnings about values it read or couldn't, and
// the one error for input it can't read at all. Shared by the export parser
// and the listing and typed-in comp readers, so their codes line up.

export type ParseWarningCode =
  | 'missing_column' | 'unknown_column' | 'duplicate_column' | 'renamed_column'
  | 'unreadable_value' | 'value_adjusted' | 'closing_record' | 'approx_area'
  | 'unrecognised_status' | 'missing_address' | 'duplicate_property' | 'ragged_row'
  | 'encoding' | 'file_note' | 'no_rows' | 'zero_price'
  // Links and typed-in comps (CR-2.2)
  | 'off_market' | 'rental_listing' | 'not_a_listing' | 'status_conflict' | 'partial_address';

export interface ParseWarning {
  code: ParseWarningCode;
  message: string;
  /** 1-based data row (the header is row 0), when the warning is about one row of an export. */
  row?: number;
  /** The export's column, or the listing extract's or form's field. */
  column?: string;
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}
