import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { API, formatApiError } from "../lib/api";
import { BRAND_LOGO_BLACK, BRAND_NAME } from "../constants/brand";
import "./Enroll.css";

function useShake() {
    const [shaking, setShaking] = useState(false);
    const shake = useCallback(() => {
        setShaking(true);
        window.setTimeout(() => setShaking(false), 160);
    }, []);
    return [shaking, shake];
}

function SignaturePad({ canvasRef, onDraw }) {
    const drawing = useRef(false);
    const last = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(rect.width, 300);
        canvas.height = 90;
        const ctx = canvas.getContext("2d");
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 1.8;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        function pos(e) {
            const r = canvas.getBoundingClientRect();
            const sx = canvas.width / r.width;
            const sy = canvas.height / r.height;
            if (e.touches) {
                return {
                    x: (e.touches[0].clientX - r.left) * sx,
                    y: (e.touches[0].clientY - r.top) * sy,
                };
            }
            return {
                x: (e.clientX - r.left) * sx,
                y: (e.clientY - r.top) * sy,
            };
        }

        function start(e) {
            if (e.cancelable) e.preventDefault();
            drawing.current = true;
            const p = pos(e);
            last.current = p;
            onDraw(true);
        }

        function move(e) {
            if (!drawing.current) return;
            if (e.cancelable) e.preventDefault();
            const p = pos(e);
            ctx.beginPath();
            ctx.moveTo(last.current.x, last.current.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            last.current = p;
        }

        function end() {
            drawing.current = false;
        }

        canvas.addEventListener("mousedown", start);
        canvas.addEventListener("mousemove", move);
        canvas.addEventListener("mouseup", end);
        canvas.addEventListener("mouseleave", end);
        canvas.addEventListener("touchstart", start, { passive: false });
        canvas.addEventListener("touchmove", move, { passive: false });
        canvas.addEventListener("touchend", end);

        return () => {
            canvas.removeEventListener("mousedown", start);
            canvas.removeEventListener("mousemove", move);
            canvas.removeEventListener("mouseup", end);
            canvas.removeEventListener("mouseleave", end);
            canvas.removeEventListener("touchstart", start);
            canvas.removeEventListener("touchmove", move);
            canvas.removeEventListener("touchend", end);
        };
    }, [canvasRef, onDraw]);

    return null;
}

export default function WaiverSign() {
    const [params] = useSearchParams();
    const token = params.get("token");
    const [info, setInfo] = useState(null);
    const [phase, setPhase] = useState("loading");
    const [photoRelease, setPhotoRelease] = useState(null);
    const [typedSig, setTypedSig] = useState("");
    const [hasSig, setHasSig] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [waiverShake, shakeWaiver] = useShake();
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!token) {
            setError("Missing waiver link.");
            setPhase("error");
            return;
        }
        setPhase("loading");
        axios
            .get(`${API}/waiver-access/view`, { params: { token } })
            .then((r) => {
                setInfo(r.data);
                if (r.data.already_signed) {
                    setPhase("done");
                } else {
                    setTypedSig(r.data.guardian_name || "");
                    setPhase("sign");
                }
            })
            .catch((e) => {
                setError(formatApiError(e) || "Could not load waiver");
                setPhase("error");
            });
    }, [token]);

    function clearSig() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        setHasSig(false);
    }

    async function submitWaiver() {
        setError(null);
        if (!photoRelease || !typedSig.trim() || !hasSig) {
            shakeWaiver();
            return;
        }
        setLoading(true);
        try {
            await axios.post(`${API}/waiver-access/submit`, {
                token,
                photo_release: photoRelease === "yes",
                waiver_typed_signature: typedSig.trim(),
                waiver_signature: canvasRef.current?.toDataURL("image/png") || "",
            });
            setPhase("thanks");
        } catch (err) {
            setError(formatApiError(err) || "Could not submit waiver");
        } finally {
            setLoading(false);
        }
    }

    if (phase === "loading") {
        return (
            <div className="enroll-page">
                <div className="ew-top">
                    <img src={BRAND_LOGO_BLACK} alt={BRAND_NAME} className="ew-brand-logo" />
                </div>
                <div className="ty-wrap">
                    <div className="ty-b">Loading waiver…</div>
                </div>
            </div>
        );
    }

    if (phase === "error") {
        return (
            <div className="enroll-page">
                <div className="ew-top">
                    <img src={BRAND_LOGO_BLACK} alt={BRAND_NAME} className="ew-brand-logo" />
                </div>
                <div className="ty-wrap">
                    <div className="enroll-err" style={{ textAlign: "center" }}>{error}</div>
                </div>
            </div>
        );
    }

    if (phase === "done") {
        return (
            <div className="enroll-page">
                <div className="ew-top">
                    <img src={BRAND_LOGO_BLACK} alt={BRAND_NAME} className="ew-brand-logo" />
                </div>
                <div className="ty-wrap">
                    <div className="ty-ey">Already signed.</div>
                    <div className="ty-b">
                        The waiver for <strong>{info?.athlete_name}</strong> is already on file.
                    </div>
                </div>
            </div>
        );
    }

    if (phase === "thanks") {
        return (
            <div className="enroll-page">
                <div className="ew-top">
                    <img src={BRAND_LOGO_BLACK} alt={BRAND_NAME} className="ew-brand-logo" />
                </div>
                <div className="ty-wrap">
                    <div className="ty-ey">You&apos;re all set.</div>
                    <div className="ty-h">
                        Waiver <span>signed.</span>
                    </div>
                    <div className="ty-rule" />
                    <div className="ty-b">
                        Thank you — a copy of the signed waiver for <strong>{info?.athlete_name}</strong> will be
                        emailed to you shortly.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="enroll-page">
            <div className="ew-top">
                <div className="ew-title-row ew-title-row--end">
                    <img src={BRAND_LOGO_BLACK} alt={BRAND_NAME} className="ew-brand-logo" />
                </div>
            </div>

            <div className={`enroll-body${waiverShake ? " shake" : ""}`}>
                <div className="prefill-tag">{(info?.athlete_name || "Athlete").toUpperCase()}</div>
                <div className="prefill-sub">
                    Liability waiver for {info?.athlete_name || "your athlete"}
                    {info?.guardian_name ? ` · Parent/Guardian: ${info.guardian_name}` : ""}
                </div>

                <div className="waiver-txt">
                    <strong>Assumption of Risk.</strong> I am aware that participating in tennis and athletics
                    activities involves inherent risks including physical injury, accidents, and property damage. I
                    voluntarily assume all risks and release Elite Atmosphere Training, its coaches, staff, and
                    affiliates from any liability for injuries or damages during participation.
                    <br />
                    <br />
                    <strong>Medical Consent.</strong> I certify the participant is physically fit to participate. In
                    an emergency, I authorize EAT staff to seek medical treatment and agree to be responsible for
                    associated medical expenses.
                    <br />
                    <br />
                    <strong>Code of Conduct.</strong> I agree to abide by all rules and instructions provided by EAT
                    staff. Violation may result in dismissal without refund.
                    <br />
                    <br />
                    <strong>Personal Property.</strong> EAT is not liable for loss, theft, or damage to personal
                    property on premises.
                    <br />
                    <br />
                    <strong>Photo Release.</strong> EAT may photograph or record the participant for promotional
                    use including social media and marketing. First names may be used; full names will not be
                    shared publicly without separate consent. I waive approval and compensation rights for these
                    materials.
                </div>

                <div className="sec-lbl">Photo Release</div>
                <div>
                    <button type="button" className="radio-row" onClick={() => setPhotoRelease("yes")}>
                        <div className={`rb${photoRelease === "yes" ? " on" : ""}`} />
                        <div className="rt">
                            <strong>Yes</strong> — I authorize EAT to photograph or record my athlete for
                            promotional purposes.
                        </div>
                    </button>
                    <button type="button" className="radio-row" onClick={() => setPhotoRelease("no")}>
                        <div className={`rb${photoRelease === "no" ? " on" : ""}`} />
                        <div className="rt">
                            <strong>No</strong> — I do not authorize photography or recording of my athlete.
                        </div>
                    </button>
                </div>

                <div className="sec-lbl">Confirm Your Name</div>
                <div className="field" style={{ marginBottom: 14 }}>
                    <input
                        type="text"
                        value={typedSig}
                        onChange={(e) => setTypedSig(e.target.value)}
                        placeholder="Type full name"
                        autoComplete="off"
                    />
                </div>

                <div className="sec-lbl">Draw Your Signature</div>
                <div className="sig-wrap">
                    <canvas ref={canvasRef} />
                    <SignaturePad canvasRef={canvasRef} onDraw={setHasSig} />
                    <button type="button" className="sig-clr" onClick={clearSig}>
                        Clear
                    </button>
                </div>

                {error && <div className="enroll-err">{error}</div>}

                <div className="actions">
                    <div />
                    <button type="button" className="btn-next" onClick={submitWaiver} disabled={loading}>
                        {loading ? "Submitting…" : "Submit →"}
                    </button>
                </div>
            </div>
        </div>
    );
}
