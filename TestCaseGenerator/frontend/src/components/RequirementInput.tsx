interface Props {
  value: string;
  onChange: (v: string) => void;
  onGenerate: () => void;
  loading: boolean;
  disabled: boolean;
}

export default function RequirementInput({
  value,
  onChange,
  onGenerate,
  loading,
  disabled,
}: Props) {
  return (
    <>
      <div className="textarea-header">
        <label className="field-label" htmlFor="req-input">
          Paste your Jira requirement / user story below
        </label>
        <span className="char-count">{value.length} chars</span>
      </div>
      <textarea
        id="req-input"
        className="textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Example:\n\nAs a registered user, I want to log in with my email and password so that I can access my account dashboard.\n\nAcceptance Criteria:\n- Valid credentials redirect to dashboard\n- Invalid credentials show error message\n- Password input is masked\n- Session persists for 24 hours`}
        rows={8}
        disabled={loading}
      />
      <div className="btn-row">
        <button
          id="generate-btn"
          className="btn-primary"
          onClick={onGenerate}
          disabled={disabled}
          type="button"
        >
          {loading ? (
            <>
              <span
                style={{
                  width: 16,
                  height: 16,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              Generating…
            </>
          ) : (
            <>✨ Generate Test Cases</>
          )}
        </button>
      </div>
    </>
  );
}
