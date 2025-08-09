import React, { useState, useCallback } from 'react';
import { LyricLine, SongMetadata } from '../types';
import { parseLRC } from '../services/lrcParser';
import { UploadIcon } from './icons';
import * as mm from 'music-metadata-browser';

interface FileUploaderProps {
  onFilesLoaded: (audioUrl: string, lyrics: LyricLine[], metadata: SongMetadata) => void;
}

export default function FileUploader({ onFilesLoaded }: FileUploaderProps): React.ReactNode {
  const [m4aFile, setM4aFile] = useState<File | null>(null);
  const [lrcFile, setLrcFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleM4aChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.type === 'audio/mp4' || file.name.endsWith('.m4a'))) {
      setM4aFile(file);
      setError(null);
    } else {
      setM4aFile(null);
      setError('Please select a valid .m4a audio file.');
    }
  };

  const handleLrcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.lrc')) {
      setLrcFile(file);
      setError(null);
    } else {
      setLrcFile(null);
      setError('Please select a valid .lrc lyric file.');
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!m4aFile || !lrcFile) {
      setError('Please select both an M4A audio file and an LRC lyrics file.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const audioUrl = URL.createObjectURL(m4aFile);
      const lrcText = await lrcFile.text();
      const lyrics = parseLRC(lrcText);

      if (lyrics.length === 0) {
        throw new Error('The LRC file seems to be empty or in an invalid format.');
      }
      
      let metadata: SongMetadata = { title: m4aFile.name.replace(/\.m4a$/, '') };
      try {
        const parsedMetadata = await mm.parseBlob(m4aFile);
        if(parsedMetadata.common.title) {
            metadata.title = parsedMetadata.common.title;
        }
        if(parsedMetadata.common.picture && parsedMetadata.common.picture.length > 0) {
            const picture = parsedMetadata.common.picture[0];
            metadata.picture = `data:${picture.format};base64,${picture.data.toString('base64')}`;
        }
      } catch (metaError) {
        console.warn("Could not parse music metadata:", metaError);
        // Fallback to filename is already set
      }

      onFilesLoaded(audioUrl, lyrics, metadata);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to process files.');
      setIsLoading(false);
    }
  }, [m4aFile, lrcFile, onFilesLoaded]);

  return (
    <div className="w-full max-w-2xl p-8 space-y-8 bg-slate-800 rounded-2xl shadow-2xl">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white font-orbitron text-shadow-neon">LYRIC SHOOTER</h1>
        <p className="mt-2 text-sky-300">Upload an M4A audio file and its corresponding LRC lyric file to begin.</p>
      </div>

      {error && <div className="p-4 text-center text-red-300 bg-red-900 bg-opacity-50 rounded-lg">{error}</div>}

      <div className="space-y-6">
        <FileDropZone
          id="m4a-upload"
          label="M4A Audio File"
          file={m4aFile}
          accept="audio/mp4,.m4a"
          onChange={handleM4aChange}
        />
        <FileDropZone
          id="lrc-upload"
          label="LRC Lyric File"
          file={lrcFile}
          accept=".lrc"
          onChange={handleLrcChange}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={!m4aFile || !lrcFile || isLoading}
        className="w-full px-8 py-4 text-xl font-bold text-white transition-all duration-300 bg-sky-600 rounded-lg disabled:bg-slate-600 disabled:cursor-not-allowed hover:bg-sky-500 font-orbitron box-shadow-neon disabled:shadow-none"
      >
        {isLoading ? 'Loading...' : 'LOAD GAME'}
      </button>
    </div>
  );
}


interface FileDropZoneProps {
    id: string;
    label: string;
    file: File | null;
    accept: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const FileDropZone = ({ id, label, file, accept, onChange }: FileDropZoneProps): React.ReactNode => (
  <div>
    <label htmlFor={id} className="block mb-2 text-sm font-medium text-sky-200">{label}</label>
    <div className="flex items-center justify-center w-full">
      <label
        htmlFor={id}
        className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-600 border-dashed rounded-lg cursor-pointer bg-slate-700 hover:bg-slate-600 transition-colors"
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <UploadIcon className="w-10 h-10 mb-3 text-slate-400" />
          {file ? (
            <p className="font-semibold text-green-400">{file.name}</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-slate-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
              <p className="text-xs text-slate-500">{label}</p>
            </>
          )}
        </div>
        <input id={id} type="file" className="hidden" accept={accept} onChange={onChange} />
      </label>
    </div>
  </div>
);