// Centralized data-testid constants. Keep kebab-case.
export const LOGIN = {
    emailInput: "login-email-input",
    passwordInput: "login-password-input",
    passwordSubmitBtn: "login-password-submit-btn",
    magicLinkBtn: "login-magic-link-btn",
    submitBtn: "login-submit-btn",
    sentMessage: "login-sent-message",
    devLink: "login-dev-magic-link",
};

export const NAV = {
    calendar: "nav-calendar",
    roster: "nav-roster",
    invoices: "nav-invoices",
    settings: "nav-settings",
    logout: "nav-logout",
};

export const SETTINGS = {
    updatePasswordBtn: "settings-update-password-btn",
    passwordCurrent: "settings-password-current",
    passwordNew: "settings-password-new",
    passwordConfirm: "settings-password-confirm",
    passwordSubmit: "settings-password-submit",
    rateCardOpenBtn: "settings-rate-card-open-btn",
    rateCardNotionLink: "settings-rate-card-notion-link",
    notionSyncBtn: "settings-notion-sync-btn",
    notionRatesSyncBtn: "settings-notion-rates-sync-btn",
};

export const CALENDAR = {
    newSessionBtn: "calendar-new-session-btn",
    sessionCard: (id) => `session-card-${id}`,
    weekStripDay: (d) => `week-day-${d}`,
    emptyState: "calendar-empty-state",
};

export const SESSION = {
    saveAttendanceBtn: "session-save-attendance-btn",
    statusBtn: "session-status-btn",
    statusOption: (status) => `session-status-option-${status}`,
    editBtn: "session-edit-btn",
    deleteBtn: "session-delete-btn",
    deleteConfirmBtn: "session-delete-confirm-btn",
    chip: (athleteId, type) => `chip-${athleteId}-${type}`,
};

export const ROSTER = {
    searchInput: "roster-search-input",
    filterProgram: "roster-filter-program",
    filterStatus: "roster-filter-status",
    addBtn: "roster-add-btn",
    newBtn: "roster-new-athlete-btn",
    newFamilyBtn: "roster-new-family-btn",
    card: (id) => `athlete-card-${id}`,
};

export const ATHLETE_FORM = {
    nameInput: "athlete-name-input",
    dobInput: "athlete-dob-input",
    program: "athlete-program-select",
    status: "athlete-status-select",
    rateType: "athlete-ratetype-select",
    enrollmentTier: "athlete-enrollment-tier-select",
    rateOverride: "athlete-rate-override-input",
    utr: "athlete-utr-input",
    wtn: "athlete-wtn-input",
    shirt: "athlete-shirt-input",
    medicalConditions: "athlete-medical-conditions-input",
    trainingStart: "athlete-training-start-input",
    family: "athlete-family-select",
    submit: "athlete-form-submit-btn",
    archive: "athlete-archive-btn",
    sendWaiver: "athlete-send-waiver-btn",
};

export const FAMILY_FORM = {
    name: "family-name-input",
    guardianName: "family-guardian-name-input",
    guardianEmail: "family-guardian-email-input",
    guardianPhone: "family-guardian-phone-input",
    guardianTwoName: "family-guardian-two-name-input",
    guardianTwoEmail: "family-guardian-two-email-input",
    guardianTwoPhone: "family-guardian-two-phone-input",
    ecName: "family-ec-name-input",
    ecPhone: "family-ec-phone-input",
    ecEmail: "family-ec-email-input",
    submit: "family-form-submit-btn",
};

export const INVOICES = {
    newBtn: "invoices-new-btn",
    familySelect: "invoice-family-select",
    periodStart: "invoice-period-start",
    periodEnd: "invoice-period-end",
    generateBtn: "invoice-generate-btn",
    refreshBtn: "invoice-refresh-btn",
    addLineBtn: "invoice-add-line-btn",
    lineQuantity: (id) => `invoice-line-qty-${id}`,
    serviceSelect: "invoice-service-select",
    lineAthleteSelect: "invoice-line-athlete-select",
    sendBtn: "invoice-send-btn",
    sendReceiptBtn: "invoice-send-receipt-btn",
    previewReceiptBtn: "invoice-preview-receipt-btn",
    previewReceiptPdfTab: "invoice-preview-receipt-pdf-tab",
    previewReceiptEmailTab: "invoice-preview-receipt-email-tab",
    previewReceiptSendBtn: "invoice-preview-receipt-send-btn",
    deleteBtn: "invoice-delete-btn",
    deleteConfirmBtn: "invoice-delete-confirm-btn",
    markPaidBtn: "invoice-mark-paid-btn",
    discountPresetSelect: "invoice-discount-preset-select",
    discountLabel: "invoice-discount-label",
    discountType: "invoice-discount-type",
    discountValue: "invoice-discount-value",
    discountApplyBtn: "invoice-discount-apply-btn",
    discountClearBtn: "invoice-discount-clear-btn",
    discountSavePreset: "invoice-discount-save-preset",
    paymentAmount: "payment-amount-input",
    paymentMethod: "payment-method-input",
    paymentDate: "payment-date-input",
    paymentNote: "payment-note-input",
    paymentSubmit: "payment-submit-btn",
    card: (id) => `invoice-card-${id}`,
};

export const SESSION_FORM = {
    date: "session-form-date",
    start: "session-form-start",
    end: "session-form-end",
    type: "session-form-type",
    location: "session-form-location",
    notes: "session-form-notes",
    recurringToggle: "session-form-recurring-toggle",
    recurringFrequency: "session-form-recurring-frequency",
    recurringInterval: "session-form-recurring-interval",
    recurringWeekday: (i) => `session-form-recurring-weekday-${i}`,
    recurringWeeks: "session-form-recurring-weeks",
    submit: "session-form-submit",
    athleteToggle: (id) => `session-form-athlete-${id}`,
};
