package cache

import (
	"inter_map/api/internal/models"
	"testing"
)

func makeLessons(n int) []models.Lesson {
	lessons := make([]models.Lesson, n)
	for i := 0; i < n; i++ {
		lessons[i] = models.Lesson{
			LessonID:  i,
			TeacherID: "334",
			Group:     "CS-101",
		}
	}
	return lessons
}

func TestFilter_NoLimitReturnsAll(t *testing.T) {
	c := &LessonCache{lessons: makeLessons(1500)}

	result := c.Filter("", "", "", "", 0)

	if len(result) != 1500 {
		t.Fatalf("ожидалось 1500 записей, получено %d", len(result))
	}
}

func TestFilter_WithLimitCapsResult(t *testing.T) {
	c := &LessonCache{lessons: makeLessons(1500)}

	result := c.Filter("", "", "", "", 50)

	if len(result) != 50 {
		t.Fatalf("ожидалось 50 записей с limit=50, получено %d", len(result))
	}
}

func TestFilter_ByTeacherID(t *testing.T) {
	lessons := makeLessons(10)
	lessons[5].TeacherID = "999"

	c := &LessonCache{lessons: lessons}

	result := c.Filter("334", "", "", "", 0)

	if len(result) != 9 {
		t.Fatalf("ожидалось 9 записей для id=334, получено %d", len(result))
	}
}
