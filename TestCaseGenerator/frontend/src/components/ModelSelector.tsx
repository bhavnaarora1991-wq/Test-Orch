interface Props {
  models: string[];
  selected: string;
  onChange: (v: string) => void;
  error: string;
}

export default function ModelSelector({ models, selected, onChange, error }: Props) {
  const isNoModels = error.includes('No models');
  const isOffline = error.includes('ollama serve');

  return (
    <div className="field">
      <label className="field-label">🤖 Ollama Model</label>

      {models.length === 0 && !error ? (
        <div className="select" style={{ opacity: 0.5, cursor: 'wait', display: 'flex', alignItems: 'center' }}>
          Connecting to Ollama…
        </div>
      ) : models.length > 0 ? (
        <select
          id="model-select"
          className="select"
          value={selected}
          onChange={(e) => onChange(e.target.value)}
        >
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      ) : (
        <div className="select" style={{ opacity: 0.45, cursor: 'not-allowed' }}>
          {isOffline ? 'Ollama not running' : 'No models available'}
        </div>
      )}

      {error && (
        <div className="model-error-box">
          {isOffline && (
            <>
              <p>⚠️ Ollama is not running. Start it with:</p>
              <code className="cmd-code">ollama serve</code>
              <p style={{ marginTop: 6 }}>Then refresh this page.</p>
            </>
          )}
          {isNoModels && (
            <>
              <p>✅ Ollama is running but has no models yet. Pull one:</p>
              <code className="cmd-code">ollama pull llama3</code>
              <p style={{ marginTop: 6 }}>Then refresh this page.</p>
            </>
          )}
          {!isOffline && !isNoModels && <p>⚠️ {error}</p>}
        </div>
      )}
    </div>
  );
}
