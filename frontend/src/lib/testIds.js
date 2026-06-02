// Centralized data-testid constants. Keep kebab-case.
export const LOGIN = {
    emailInput: "login-email-input",
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

export const CALENDAR = {
    newSessionBtn: "calendar-new-session-btn",
    sessionCard: (id) => `session-card-${id}`,
    weekStripDay: (d) => `week-day-${d}`,
    emptyState: "calendar-empty-state",
};

export const SESSION = {
    saveAttendanceBtn: "session-save-attendance-btn",
    completeBtn: "session-complete-btn",
    cancelBtn: "session-cancel-btn",
    editBtn: "session-edit-btn",
    deleteBtn: "session-delete-btn",
    chip: (athleteId, type) => `chip-${athleteId}-${type}`,
};

export const ROSTER = {
    searchInput: "roster-search-input",
    filterProgram: "roster-filter-program",
    filterStatus: "roster-filter-status",
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
    rateOverride: "athlete-rate-override-input",
    utr: "athlete-utr-input",
    wtn: "athlete-wtn-input",
    shirt: "athlete-shirt-input",
    medicalConditions: "athlete-medical-conditions-input",
    trainingStart: "athlete-training-start-input",
    family: "athlete-family-select",
    submit: "athlete-form-submit-btn",
    archive: "athlete-archive-btn",
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
    previewPdfBtn: "invoice-preview-pdf-btn",
    sendBtn: "invoice-send-btn",
    deleteBtn: "invoice-delete-btn",
    markPaidBtn: "invoice-mark-paid-btn",
    paymentAmount: "payment-amount-input",
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
    submit: "session-form-submit",
    athleteToggle: (id) => `session-form-athlete-${id}`,
};
