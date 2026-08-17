import type {StructureResolver} from 'sanity/structure'
import {orderableDocumentListDeskItem} from '@sanity/orderable-document-list'
import {DocumentIcon} from '@sanity/icons/Document'

// サイドバーの構成。
// orderableDocumentListDeskItem はドラッグ＆ドロップで並べ替えできる一覧を出す。
export const structure: StructureResolver = (S, context) =>
  S.list()
    .id('root')
    .title('コンテンツ')
    .items([
      orderableDocumentListDeskItem({
        type: 'project',
        title: '制作実績',
        icon: DocumentIcon,
        S,
        context,
      }),
      orderableDocumentListDeskItem({
        type: 'animation',
        title: 'アニメーション',
        icon: DocumentIcon,
        S,
        context,
      }),
    ])
