import StarterKit from '@tiptap/starter-kit';

/**
 * The one schema for notes. The editor (app and extension) and the static renderer on
 * /noteorg both build from this list, so anything the editor can write, the site can show.
 */
export const noteExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    },
  }),
];
