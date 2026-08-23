import {defineField, defineType} from 'sanity'
import {DocumentIcon} from '@sanity/icons/Document'
import {orderRankField, orderRankOrdering} from '@sanity/orderable-document-list'

export const animation = defineType({
  name: 'animation',
  title: 'アニメーション',
  type: 'document',
  icon: DocumentIcon,
  // 「表示順」リストのドラッグ＆ドロップで並べ替えるための並び順
  orderings: [orderRankOrdering],
  fields: [
    // ドラッグ順を保持する隠しフィールド。新規作成時は先頭に入る。
    orderRankField({type: 'animation', newItemPosition: 'before'}),
    defineField({
      name: 'title',
      title: 'タイトル',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'スラッグ',
      description: '詳細ページの URL に使う。半角英数字とハイフンのみ。',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'thumbnail',
      title: 'サムネイル',
      type: 'image',
      // 画像内の見せたい部分を指定できるようにする
      options: {hotspot: true},
      fields: [
        defineField({
          name: 'alt',
          title: '代替テキスト',
          type: 'string',
        }),
      ],
    }),
    defineField({
      name: 'video',
      title: 'サムネイル動画',
      description:
        'MP4(H.264・音声なし)。トップの板に動く絵として貼る。未設定ならサムネイル画像のまま。' +
        '変換なしでそのまま配信するので、幅 1200px・数秒ループ・数MB以内にしてからアップロードする。',
      type: 'file',
      options: {accept: 'video/mp4'},
    }),
    defineField({
      name: 'link',
      title: 'リンク',
      type: 'url',
    }),
  ],
  preview: {
    select: {title: 'title', subtitle: 'subtitle', media: 'thumbnail', link: 'link'},
  },
})
