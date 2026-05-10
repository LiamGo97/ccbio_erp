# CCBio ERP UI 스타일 가이드

이 문서는 CCBio ERP 프로젝트의 UI 컴포넌트 스타일 정보를 정리한 것입니다. 새 프로젝트에 동일한 스타일을 적용할 때 참고하세요.

## 목차
1. [사이드바 스타일](#사이드바-스타일)
2. [버튼 컴포넌트 스타일](#버튼-컴포넌트-스타일)
3. [테이블 스타일](#테이블-스타일)
4. [카드 컴포넌트 스타일](#카드-컴포넌트-스타일)
5. [색상 팔레트](#색상-팔레트)
6. [간격(Spacing) 값](#간격spacing-값)

---

## 사이드바 스타일

### 사이드바 폭
- **기본 폭**: `16rem` (256px)
- **모바일 폭**: `18rem` (288px)
- **아이콘 모드 폭**: `3rem` (48px)

### 사이드바 메뉴 항목

#### 일반 메뉴 항목 (SidebarMenuButton)
```tsx
className="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0"
```

**크기별 스타일:**
- **default**: `h-8 text-sm` (높이: 32px, 폰트: 14px)
- **sm**: `h-7 text-xs` (높이: 28px, 폰트: 12px)
- **lg**: `h-12 text-sm` (높이: 48px, 폰트: 14px)

**패딩**: `p-2` (8px)

**아이콘 크기**: `size-4` (16px × 16px)

#### 활성화된 메뉴 항목
```tsx
data-active={true}
className="... data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-foreground"
```

**추가 스타일:**
- 배경색: `bg-sidebar-accent`
- 폰트 굵기: `font-semibold`
- 텍스트 색상: `text-sidebar-foreground`

#### 하위 메뉴 항목 (SidebarMenuSubButton)
```tsx
className="text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0"
```

**크기별 스타일:**
- **sm**: `h-7 text-xs` (높이: 28px, 폰트: 12px)
- **md**: `h-7 text-sm` (높이: 28px, 폰트: 14px)

**패딩**: `px-2` (좌우 8px)

**아이콘 크기**: `size-4` (16px × 16px)

### 사이드바 그룹 레이블
```tsx
className="text-sidebar-foreground/70 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium"
```

**스타일:**
- 높이: `h-8` (32px)
- 폰트 크기: `text-xs` (12px)
- 폰트 굵기: `font-medium`
- 패딩: `px-2` (좌우 8px)
- 텍스트 색상: `text-sidebar-foreground/70` (70% 투명도)

---

## 버튼 컴포넌트 스타일

### 기본 버튼 클래스
```tsx
className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 shrink-0"
```

### 크기별 스타일

#### default
```tsx
className="h-9 px-4 py-2 has-[>svg]:px-3"
```
- 높이: `h-9` (36px)
- 패딩: `px-4 py-2` (좌우 16px, 상하 8px)
- 아이콘 있을 때: `px-3` (좌우 12px)
- 폰트 크기: `text-sm` (14px)

#### sm (small)
```tsx
className="h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5"
```
- 높이: `h-8` (32px)
- 패딩: `px-3` (좌우 12px)
- 아이콘 있을 때: `px-2.5` (좌우 10px)
- 폰트 크기: `text-sm` (14px)

#### lg (large)
```tsx
className="h-10 rounded-md px-6 has-[>svg]:px-4"
```
- 높이: `h-10` (40px)
- 패딩: `px-6` (좌우 24px)
- 아이콘 있을 때: `px-4` (좌우 16px)
- 폰트 크기: `text-sm` (14px)

#### icon
```tsx
className="size-9"
```
- 크기: `size-9` (36px × 36px)

#### icon-sm
```tsx
className="size-8"
```
- 크기: `size-8` (32px × 32px)

#### icon-lg
```tsx
className="size-10"
```
- 크기: `size-10` (40px × 40px)

### 버튼 Variant별 스타일

#### default
```tsx
className="bg-primary text-primary-foreground hover:bg-primary/90"
```

#### destructive
```tsx
className="bg-destructive text-white hover:bg-destructive/90"
```

#### outline
```tsx
className="border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground"
```

#### secondary
```tsx
className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
```

#### ghost
```tsx
className="hover:bg-accent hover:text-accent-foreground"
```

#### link
```tsx
className="text-primary underline-offset-4 hover:underline"
```

---

## 테이블 스타일

### 테이블 헤더 (TableHead)
```tsx
className="text-foreground h-8 px-2 text-left align-middle text-xs font-semibold whitespace-nowrap border-r border-border last:border-r-0"
```

**스타일:**
- 높이: `h-8` (32px)
- 패딩: `px-2` (좌우 8px)
- 폰트 크기: `text-xs` (12px)
- 폰트 굵기: `font-semibold`
- 텍스트 정렬: `text-left`
- 테두리: `border-r border-border` (우측 테두리)

### 테이블 셀 (TableCell)
```tsx
className="px-2 py-1 align-middle text-xs whitespace-nowrap border-r border-border last:border-r-0"
```

**스타일:**
- 패딩: `px-2 py-1` (좌우 8px, 상하 4px)
- 폰트 크기: `text-xs` (12px)
- 테두리: `border-r border-border` (우측 테두리)

### 테이블 행 (TableRow)
```tsx
className="hover:bg-muted data-[state=selected]:bg-muted border-b border-border transition-colors"
```

**스타일:**
- 호버 배경: `hover:bg-muted`
- 선택된 행 배경: `data-[state=selected]:bg-muted`
- 하단 테두리: `border-b border-border`

---

## 카드 컴포넌트 스타일

### 카드 (Card)
```tsx
className="bg-card text-card-foreground flex flex-col gap-6 rounded-md border py-6 shadow-sm"
```

**스타일:**
- 패딩: `py-6` (상하 24px)
- 간격: `gap-6` (24px)
- 테두리: `border`
- 그림자: `shadow-sm`
- 모서리: `rounded-md` (6px)

### 카드 헤더 (CardHeader)
```tsx
className="grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6"
```

**스타일:**
- 패딩: `px-6` (좌우 24px)
- 간격: `gap-2` (8px)

### 카드 제목 (CardTitle)
```tsx
className="leading-none font-semibold"
```

**스타일:**
- 폰트 굵기: `font-semibold`
- 줄 높이: `leading-none`

### 카드 설명 (CardDescription)
```tsx
className="text-muted-foreground text-sm"
```

**스타일:**
- 폰트 크기: `text-sm` (14px)
- 텍스트 색상: `text-muted-foreground`

### 카드 콘텐츠 (CardContent)
```tsx
className="px-6"
```

**스타일:**
- 패딩: `px-6` (좌우 24px)

### 카드 푸터 (CardFooter)
```tsx
className="flex items-center px-6"
```

**스타일:**
- 패딩: `px-6` (좌우 24px)

---

## 색상 팔레트

### 라이트 모드 (Light Mode)

#### 기본 색상
- **background**: `oklch(1 0 0)` - 흰색
- **foreground**: `oklch(0.145 0 0)` - 거의 검은색
- **card**: `oklch(1 0 0)` - 흰색
- **card-foreground**: `oklch(0.145 0 0)` - 거의 검은색

#### Primary 색상
- **primary**: `oklch(0.205 0 0)` - 어두운 회색
- **primary-foreground**: `oklch(0.985 0 0)` - 거의 흰색

#### Secondary 색상
- **secondary**: `oklch(0.97 0 0)` - 매우 밝은 회색
- **secondary-foreground**: `oklch(0.205 0 0)` - 어두운 회색

#### Muted 색상
- **muted**: `oklch(0.97 0 0)` - 매우 밝은 회색
- **muted-foreground**: `oklch(0.556 0 0)` - 중간 회색

#### Accent 색상
- **accent**: `oklch(0.97 0 0)` - 매우 밝은 회색
- **accent-foreground**: `oklch(0.205 0 0)` - 어두운 회색

#### Destructive 색상
- **destructive**: `oklch(0.577 0.245 27.325)` - 빨간색
- **destructive-foreground**: `oklch(0.985 0 0)` - 거의 흰색

#### 테두리 및 입력
- **border**: `oklch(0.922 0 0)` - 밝은 회색
- **input**: `oklch(0.922 0 0)` - 밝은 회색
- **ring**: `oklch(0.708 0 0)` - 중간 회색

#### 사이드바 색상
- **sidebar**: `oklch(0.985 0 0)` - 거의 흰색
- **sidebar-foreground**: `oklch(0.145 0 0)` - 거의 검은색
- **sidebar-primary**: `oklch(0.205 0 0)` - 어두운 회색
- **sidebar-primary-foreground**: `oklch(0.985 0 0)` - 거의 흰색
- **sidebar-accent**: `oklch(0.97 0 0)` - 매우 밝은 회색
- **sidebar-accent-foreground**: `oklch(0.205 0 0)` - 어두운 회색
- **sidebar-border**: `oklch(0.922 0 0)` - 밝은 회색
- **sidebar-ring**: `oklch(0.708 0 0)` - 중간 회색

### 다크 모드 (Dark Mode)

#### 기본 색상
- **background**: `oklch(0.145 0 0)` - 거의 검은색
- **foreground**: `oklch(0.985 0 0)` - 거의 흰색
- **card**: `oklch(0.205 0 0)` - 어두운 회색
- **card-foreground**: `oklch(0.985 0 0)` - 거의 흰색

#### Primary 색상
- **primary**: `oklch(0.922 0 0)` - 밝은 회색
- **primary-foreground**: `oklch(0.205 0 0)` - 어두운 회색

#### Secondary 색상
- **secondary**: `oklch(0.269 0 0)` - 어두운 회색
- **secondary-foreground**: `oklch(0.985 0 0)` - 거의 흰색

#### Muted 색상
- **muted**: `oklch(0.269 0 0)` - 어두운 회색
- **muted-foreground**: `oklch(0.708 0 0)` - 중간 회색

#### Accent 색상
- **accent**: `oklch(0.269 0 0)` - 어두운 회색
- **accent-foreground**: `oklch(0.985 0 0)` - 거의 흰색

#### Destructive 색상
- **destructive**: `oklch(0.704 0.191 22.216)` - 빨간색
- **destructive-foreground**: `oklch(0.985 0 0)` - 거의 흰색

#### 테두리 및 입력
- **border**: `oklch(1 0 0 / 10%)` - 흰색 10% 투명도
- **input**: `oklch(1 0 0 / 15%)` - 흰색 15% 투명도
- **ring**: `oklch(0.556 0 0)` - 중간 회색

#### 사이드바 색상
- **sidebar**: `oklch(0.205 0 0)` - 어두운 회색
- **sidebar-foreground**: `oklch(0.985 0 0)` - 거의 흰색
- **sidebar-primary**: `oklch(0.488 0.243 264.376)` - 보라색
- **sidebar-primary-foreground**: `oklch(0.985 0 0)` - 거의 흰색
- **sidebar-accent**: `oklch(0.269 0 0)` - 어두운 회색
- **sidebar-accent-foreground**: `oklch(0.985 0 0)` - 거의 흰색
- **sidebar-border**: `oklch(1 0 0 / 10%)` - 흰색 10% 투명도
- **sidebar-ring**: `oklch(0.556 0 0)` - 중간 회색

---

## 간격(Spacing) 값

### Tailwind 기본 간격
- `0`: 0px
- `0.5`: 2px
- `1`: 4px
- `1.5`: 6px
- `2`: 8px
- `2.5`: 10px
- `3`: 12px
- `3.5`: 14px
- `4`: 16px
- `5`: 20px
- `6`: 24px
- `8`: 32px
- `10`: 40px
- `12`: 48px
- `16`: 64px
- `20`: 80px
- `24`: 96px

### 프로젝트에서 자주 사용되는 간격

#### 사이드바
- 메뉴 항목 간격: `gap-1` (4px)
- 그룹 간격: `gap-2` (8px)
- 헤더/푸터 패딩: `p-2` (8px)
- 메뉴 버튼 패딩: `p-2` (8px)

#### 버튼
- 기본 패딩: `px-4 py-2` (좌우 16px, 상하 8px)
- 작은 버튼 패딩: `px-3` (좌우 12px)
- 큰 버튼 패딩: `px-6` (좌우 24px)
- 아이콘 간격: `gap-2` (8px)

#### 테이블
- 셀 패딩: `px-2 py-1` (좌우 8px, 상하 4px)
- 헤더 높이: `h-8` (32px)

#### 카드
- 카드 패딩: `py-6` (상하 24px)
- 콘텐츠 패딩: `px-6` (좌우 24px)
- 내부 간격: `gap-6` (24px)
- 헤더 간격: `gap-2` (8px)

---

## 사용 예시

### 사이드바 메뉴 항목
```tsx
<SidebarMenuButton
  isActive={isActive}
  size="default"
>
  <Icon />
  <span>메뉴 항목</span>
</SidebarMenuButton>
```

### 버튼
```tsx
<Button variant="default" size="default">
  <Icon />
  버튼 텍스트
</Button>
```

### 테이블
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>헤더</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>셀 내용</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

### 카드
```tsx
<Card>
  <CardHeader>
    <CardTitle>제목</CardTitle>
    <CardDescription>설명</CardDescription>
  </CardHeader>
  <CardContent>
    콘텐츠
  </CardContent>
</Card>
```

---

## 참고 사항

1. **아이콘 크기**: 대부분의 컴포넌트에서 아이콘은 `size-4` (16px × 16px)를 사용합니다.

2. **폰트 크기**: 
   - 기본 텍스트: `text-sm` (14px)
   - 작은 텍스트: `text-xs` (12px)
   - 큰 텍스트: `text-base` (16px)

3. **모서리 반경**: 
   - 기본: `rounded-md` (6px)
   - 작은 모서리: `rounded-sm` (2px)
   - 큰 모서리: `rounded-lg` (8px)

4. **전환 효과**: 대부분의 컴포넌트에 `transition-colors` 또는 `transition-all`이 적용되어 있습니다.

5. **포커스 링**: `focus-visible:ring-2` 또는 `focus-visible:ring-[3px]`를 사용합니다.

---

이 문서는 CCBio ERP 프로젝트의 UI 스타일을 기반으로 작성되었습니다. 새 프로젝트에 적용할 때는 이 가이드를 참고하여 일관된 디자인을 유지하세요.
