import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const toJSON = {
  versionKey: false,
  transform(_doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.passwordHash;
    return ret;
  },
};

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'moderator', 'admin'], default: 'user' },
    bio: { type: String, maxlength: 280, default: '' },
    consents: {
      terms: { type: Date, required: true },
      marketing: { type: Boolean, default: false },
    },
  },
  { timestamps: true, toJSON },
);

/** Refresh tokens opaques, stockés hachés. `family` permet la détection de réutilisation. */
const refreshTokenSchema = new Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
  },
  { timestamps: true },
);
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const postSchema = new Schema(
  {
    author: { type: ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true, maxlength: 2000 },
    likes: [{ type: ObjectId, ref: 'User' }],
    commentCount: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON },
);
postSchema.index({ createdAt: -1, _id: -1 });

const commentSchema = new Schema(
  {
    post: { type: ObjectId, ref: 'Post', required: true, index: true },
    author: { type: ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 1000 },
  },
  { timestamps: true, toJSON },
);

const messageSchema = new Schema(
  {
    from: { type: ObjectId, ref: 'User', required: true },
    to: { type: ObjectId, ref: 'User', required: true },
    conversation: { type: String, required: true, index: true },
    content: { type: String, required: true, maxlength: 2000 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON },
);

const notificationSchema = new Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['like', 'comment', 'message'], required: true },
    actor: { type: ObjectId, ref: 'User' },
    ref: { type: String },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON },
);

const auditLogSchema = new Schema(
  {
    actor: { type: ObjectId, ref: 'User' },
    action: { type: String, required: true },
    target: { type: String },
    meta: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: true, toJSON },
);

export const conversationId = (a, b) => [String(a), String(b)].sort().join(':');

export const User = model('User', userSchema);
export const RefreshToken = model('RefreshToken', refreshTokenSchema);
export const Post = model('Post', postSchema);
export const Comment = model('Comment', commentSchema);
export const Message = model('Message', messageSchema);
export const Notification = model('Notification', notificationSchema);
export const AuditLog = model('AuditLog', auditLogSchema);
