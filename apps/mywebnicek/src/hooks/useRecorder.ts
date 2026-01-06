import { type RecordedAction, Recorder } from "@mydenicek/core";
import { useCallback, useState } from "react";

export function useRecorder() {
  const [recorder, setRecorder] = useState<Recorder | null>(null);
  const [recordedScript, setRecordedScript] = useState<RecordedAction[] | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = useCallback((startNodeId: string) => {
    setRecorder(new Recorder(startNodeId));
    setRecordedScript([]);
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    if (recorder) {
      setRecordedScript(recorder.getActions());
      setRecorder(null);
      setIsRecording(false);
    }
  }, [recorder]);

  const recordAction = useCallback((action: (r: Recorder) => void) => {
      if (recorder) {
          action(recorder);
          setRecordedScript([...recorder.getActions()]);
      }
  }, [recorder]);

  return {
    isRecording,
    recordedScript,
    startRecording,
    stopRecording,
    recordAction,
    recorder // Expose if needed for direct access, but prefer recordAction
  };
}
