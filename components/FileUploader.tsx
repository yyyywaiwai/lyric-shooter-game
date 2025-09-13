import React, { useState, useCallback } from 'react';
import { LyricLine, SongMetadata } from '../types';
import { parseLRC } from '../services/lrcParser';
import { UploadIcon } from './icons';
import SearchPanel from './SearchPanel';
import ServerConfig from './ServerConfig';

// Load jsmediatags from CDN
const loadJsMediaTags = () => {
  return new Promise((resolve) => {
    if ((window as any).jsmediatags) {
      resolve((window as any).jsmediatags);
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js';
    script.onload = () => resolve((window as any).jsmediatags);
    document.head.appendChild(script);
  });
};

interface FileUploaderProps {
  onFilesLoaded: (audioUrl: string, lyrics: LyricLine[], metadata: SongMetadata) => void;
}

export default function FileUploader({ onFilesLoaded }: FileUploaderProps): React.ReactNode {
  const [m4aFile, setM4aFile] = useState<File | null>(null);
  const [lrcFile, setLrcFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'search' | 'upload'>(() => 'search');

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
        console.log('Attempting to parse metadata with jsmediatags for file:', m4aFile.name);
        
        // Load jsmediatags library
        const jsmediatagsLib = await loadJsMediaTags();
        
        const tags = await new Promise((resolve, reject) => {
          (jsmediatagsLib as any).read(m4aFile, {
            onSuccess: (tag: any) => {
              console.log('Successfully parsed metadata:', tag);
              resolve(tag);
            },
            onError: (error: any) => {
              console.error('jsmediatags error:', error);
              reject(error);
            }
          });
        }) as any;
        
        console.log('Tags:', tags);
        console.log('Tags.tags:', tags.tags);
        
        // Extract title
        if (tags.tags.title) {
          console.log('Found title:', tags.tags.title);
          metadata.title = tags.tags.title;
        } else {
          console.log('No title found, using filename fallback');
        }
        
        // Extract album art
        if (tags.tags.picture) {
          console.log('Found album art');
          const picture = tags.tags.picture;
          console.log('Picture format:', picture.format, 'Size:', picture.data.length);
          
          try {
            // Convert picture data to base64
            const base64String = Array.from(picture.data)
              .map(byte => String.fromCharCode(byte))
              .join('');
            metadata.picture = `data:${picture.format};base64,${btoa(base64String)}`;
            console.log('Album art processed successfully');
          } catch (pictureError) {
            console.error('Error processing album art:', pictureError);
          }
        } else {
          console.log('No album art found');
        }
        
        console.log('Final metadata with jsmediatags:', metadata);
      } catch (metaError) {
        console.error("Could not parse music metadata with jsmediatags:", metaError);
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
    <div className="w-full max-w-3xl p-8 space-y-6 bg-slate-800 rounded-2xl shadow-2xl">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white font-orbitron text-shadow-neon">LYRIC SHOOTER</h1>
        <p className="mt-2 text-sky-300">Search Apple Music or upload files.</p>
      </div>

      <ServerConfig />

      <div className="grid grid-cols-2 gap-2">
        <button
          className={`px-4 py-2 rounded font-bold ${mode === 'search' ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-200'}`}
          onClick={() => setMode('search')}
        >
          Search Apple Music
        </button>
        <button
          className={`px-4 py-2 rounded font-bold ${mode === 'upload' ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-200'}`}
          onClick={() => setMode('upload')}
        >
          Upload Files
        </button>
      </div>

      {mode === 'search' ? (
        <SearchPanel onLoaded={onFilesLoaded} />
      ) : (
        <div className="space-y-6">
          {error && <div className="p-4 text-center text-red-300 bg-red-900 bg-opacity-50 rounded-lg">{error}</div>}

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

          <button
            onClick={handleSubmit}
            disabled={!m4aFile || !lrcFile || isLoading}
            className="w-full px-8 py-4 text-xl font-bold text-white transition-all duration-300 bg-sky-600 rounded-lg disabled:bg-slate-600 disabled:cursor-not-allowed hover:bg-sky-500 font-orbitron box-shadow-neon disabled:shadow-none"
          >
            {isLoading ? 'Loading...' : 'LOAD GAME'}
          </button>
        </div>
      )}
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
