import { readFileSync } from 'node:fs';
import { diagnosticFile, codeFingerprint, codeRevision, safeAiDiagnostic } from '../src/modules/student/ai.diagnostics.js';
try {
  const record = JSON.parse(readFileSync(diagnosticFile, 'utf8'));
  const runtime = record.runtime ?? {};
  let processAlive = false;
  if (Number.isSafeInteger(runtime.pid) && runtime.pid > 0) { try { process.kill(runtime.pid, 0); processAlive = true; } catch {} }
  console.info(JSON.stringify({ processAlive, pid: Number.isSafeInteger(runtime.pid) ? runtime.pid : null, currentCodeMatchesStartup: runtime.codeFingerprint === codeFingerprint(), currentRevisionMatchesStartup: runtime.revision === codeRevision(), aiEnabled: runtime.aiEnabled === true, geminiConfigured: runtime.geminiConfigured === true, modelPresent: runtime.modelPresent === true, credentialPresent: runtime.credentialPresent === true, lastDiagnostic: record.lastDiagnostic ? safeAiDiagnostic(record.lastDiagnostic) : null }));
} catch { console.info('Sin diagnóstico persistido de este arranque. Reinicia Express con el código actual; no se ha llamado al proveedor.'); }
