/**
 * NoteCard 组件
 * 
 * TODO: 根据PRD 实现笔记卡片（Task 3.7）
 * 
 * 功能描述：
 * - 显示单条笔记内容
 * - 包含展示态、编辑态、删除按钮逻辑
 * - 删除确认直接使用通用的<Modal>组件（不创建DeleteConfirmModal.jsx）
 * 
 * 相关PRD：
 * - PRD 6.2.4.h: 笔记卡片（403-424行）
 * 
 * @module components/notes/NoteCard
 */

/**
 * NoteCard 组件（占位实现，Task 3.7 完善）
 * 
 * @param {Object} props
 * @param {Object} props.note - 笔记数据
 * @param {Object} [props.highlight] - 关联的划线数据
 * @param {Function} [props.onClick] - 点击笔记卡片回调
 * @param {Function} [props.onDelete] - 删除笔记回调
 */
export default function NoteCard({ note, highlight, onClick, onDelete }) {
  // 占位实现：Task 3.7 将实现完整的笔记卡片功能
  // 当前仅用于测试和基本渲染
  return (
    <div 
      data-testid={`note-card-${note.id}`}
      onClick={onClick}
      data-note-type={note.note_type}
      data-highlight-id={highlight?.id}
      style={{ 
        padding: '8px',
        border: '1px solid #e0e0e0',
        borderRadius: '4px',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div data-testid={`note-content-${note.id}`}>
        {note.content || 'No content'}
      </div>
      {onDelete && (
        <button 
          data-testid={`note-delete-${note.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          删除
        </button>
      )}
    </div>
  );
}

