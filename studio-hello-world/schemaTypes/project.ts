import {defineField, defineType,defineArrayMember} from 'sanity'
import {DocumentIcon} from '@sanity/icons/Document'
import {orderRankField, orderRankOrdering} from '@sanity/orderable-document-list'
import {ImageIcon} from '@sanity/icons/Image'
import {UserIcon} from '@sanity/icons/User'

export const project = defineType({
  name: 'project',
  title: '制作実績',
  type: 'document',
  icon: DocumentIcon,
  // 「表示順」リストのドラッグ＆ドロップで並べ替えるための並び順
  orderings: [orderRankOrdering],
  fields: [
    // ドラッグ順を保持する隠しフィールド。新規作成時は先頭に入る。
    orderRankField({type: 'project', newItemPosition: 'before'}),
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
      name: 'outline',
      title: '概要',
      // リッチテキスト（Portable Text）。block の配列にすると Studio がリッチエディタになる
      type: 'array',
      of: [
        defineArrayMember({
          type: 'block',
          // 使えるものだけ残す。増やすとフロント側の CSS も要る
          styles: [
            {title: '本文', value: 'normal'},
            {title: '見出し', value: 'h4'},
          ],
          lists: [
            {title: '箇条書き', value: 'bullet'},
            {title: '番号付き', value: 'number'},
          ],
          marks: {
            decorators: [
              {title: '太字', value: 'strong'},
              {title: '斜体', value: 'em'},
            ],
            annotations: [
              defineArrayMember({
                name: 'link',
                title: 'リンク',
                type: 'object',
                fields: [
                  defineField({
                    name: 'href',
                    title: 'URL',
                    type: 'url',
                    validation: (rule) => rule.required(),
                  }),
                  defineField({
                    name: 'blank',
                    title: '別タブで開く',
                    type: 'boolean',
                    initialValue: false,
                  }),
                ],
              }),
            ],
          },
        }),
      ],
    }),
    defineField({
      name: 'credits',
      title: 'クレジット',
      description: '「役割」と「名前」で1組。＋ボタンで増やせる。',
      type: 'array',
      of: [
        defineArrayMember({
          name: 'credit',
          title: 'クレジット',
          type: 'object',
          icon: UserIcon,
          fields: [
            defineField({
              name: 'role',
              title: '役割',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'name',
              title: '名前',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
          ],
          preview: {
            select: {title: 'role', subtitle: 'name'},
          },
        }),
      ],
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
  name: 'images',
  title: '画像',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'image',
      icon: ImageIcon,
      options: {hotspot: true},
      fields: [
        defineField({
          name: 'alt',
          title: '代替テキスト',
          type: 'string',
        }),
      ],
      preview: {
        select: {media: 'asset', title: 'alt'},
      },
    }),
  ],
  // サムネイルのグリッド表示。省略すると縦一列のリストになる
  options: {layout: 'grid'},
  validation: (rule) => rule.max(10),
}),
  defineField({
      name: 'link',
      title: 'リンク',
      type: 'url',
    }),
  ],

  preview: {
    select: {title: 'title', subtitle: 'subtitle', media: 'thumbnail'},
  },
})
