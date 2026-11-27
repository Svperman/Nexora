import { create } from 'zustand';
import { api } from '../api.js';

export const useFeed = create((set, get) => ({
  posts: [],
  cursor: null,
  hasMore: true,
  loading: false,
  error: null,

  async loadMore() {
    const { loading, hasMore, cursor } = get();
    if (loading || !hasMore) return;
    set({ loading: true, error: null });
    try {
      const data = await api(`/posts?limit=10${cursor ? `&cursor=${cursor}` : ''}`);
      set((s) => {
        const known = new Set(s.posts.map((p) => p.id));
        return {
          posts: [...s.posts, ...data.items.filter((p) => !known.has(p.id))],
          cursor: data.nextCursor,
          hasMore: Boolean(data.nextCursor),
          loading: false,
        };
      });
    } catch (err) {
      set({ loading: false, error: err.message });
    }
  },
  reset: () => set({ posts: [], cursor: null, hasMore: true, loading: false, error: null }),

  addPost: (post) => set((s) => (s.posts.some((p) => p.id === post.id) ? s : { posts: [post, ...s.posts] })),
  removePost: (id) => set((s) => ({ posts: s.posts.filter((p) => p.id !== id) })),
  patchPost: (id, patch) => set((s) => ({ posts: s.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

  async create(content) {
    const post = await api('/posts', { method: 'POST', body: { content } });
    get().addPost(post);
  },
  async toggleLike(id) {
    const r = await api(`/posts/${id}/like`, { method: 'POST' });
    get().patchPost(id, { likeCount: r.likeCount, likedByMe: r.likedByMe });
  },
  async remove(id) {
    await api(`/posts/${id}`, { method: 'DELETE' });
    get().removePost(id);
  },
}));
