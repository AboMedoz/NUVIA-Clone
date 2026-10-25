"""Version-one internal wire contracts; Node retains authorization and persistence."""

import json
from datetime import date
from typing import Annotated, Literal
from uuid import NAMESPACE_URL, RFC_4122, UUID, uuid5

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.core.limits import MAX_SENTENCES
from app.services.preparation import prepare, validate_sentence_coverage

CAPABILITIES = (
    "language",
    "normalization",
    "sentiment",
    "aspects",
    "embeddings",
    "clustering",
    "forecasting",
    "report",
    "assistant",
    "survey_generation",
)
PIPELINE_VERSION = "nuvia-ai-1"
Label = Literal["positive", "negative", "neutral", "mixed"]
Score = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
Finite = Annotated[float, Field(allow_inf_nan=False)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, strict=True)


class Sentence(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    text: str = Field(min_length=1, max_length=50000)


class Evidence(StrictModel):
    id: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1, max_length=32768)


class TaskRequest(StrictModel):
    schemaVersion: Literal[1]
    taskId: str = Field(min_length=1, max_length=200)
    locale: Literal["ar", "en"]
    text: str | None = Field(default=None, max_length=50000)
    sentences: list[Sentence] = Field(default_factory=list, max_length=MAX_SENTENCES)
    evidence: list[Evidence] = Field(default_factory=list, max_length=200)
    parameters: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_sources(self):
        if self.text and not self.sentences:
            self.sentences = [
                Sentence.model_validate(item) for item in prepare(self.text)["sentences"]
            ]
        if len(self.sentences) > MAX_SENTENCES:
            raise ValueError("Too many sentences")
        if len({item.id for item in self.evidence}) != len(self.evidence):
            raise ValueError("Duplicate evidence IDs")
        if len({item.id for item in self.sentences}) != len(self.sentences):
            raise ValueError("Duplicate sentence IDs")
        for sentence in self.sentences:
            if (
                self.text is None
                or sentence.end > len(self.text)
                or self.text[sentence.start : sentence.end] != sentence.text
            ):
                raise ValueError("Sentence does not match raw text")
        for first, second in zip(self.sentences, self.sentences[1:]):
            if first.end > second.start:
                raise ValueError("Sentences must be ordered and nonoverlapping")
        if self.text is not None:
            validate_sentence_coverage(self.text, self.sentences)
        encoded = json.dumps(
            self.parameters, allow_nan=False, ensure_ascii=False, separators=(",", ":")
        )
        if len(encoded.encode("utf-8")) > 128000:
            raise ValueError("Parameters too large")
        return self


class SentenceSentiment(StrictModel):
    sentenceId: str
    label: Label
    confidence: Score | None = None


class SentimentResult(StrictModel):
    label: Label
    confidence: Score | None = None
    sentences: list[SentenceSentiment] = Field(min_length=1, max_length=MAX_SENTENCES)


class AspectMention(SentenceSentiment):
    aspect: str = Field(min_length=1, max_length=100)
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    quote: str = Field(min_length=1, max_length=10000)


class AspectsResult(StrictModel):
    taxonomyVersion: str = Field(min_length=1, max_length=100)
    mentions: list[AspectMention] = Field(max_length=1000)


class Vector(StrictModel):
    id: str
    values: list[Finite] = Field(min_length=1, max_length=8192)


class EmbeddingsResult(StrictModel):
    vectors: list[Vector] = Field(min_length=1, max_length=200)


class Cluster(StrictModel):
    id: str
    label: str = Field(min_length=1, max_length=200)
    memberIds: list[str] = Field(min_length=1, max_length=200)
    evidenceIds: list[str] = Field(min_length=1, max_length=200)


class ClusteringResult(StrictModel):
    clusters: list[Cluster] = Field(max_length=200)
    noiseIds: list[str] = Field(default_factory=list, max_length=200)


class ForecastPoint(StrictModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    value: Finite
    lower: Finite | None = None
    upper: Finite | None = None

    @model_validator(mode="after")
    def interval(self):
        date.fromisoformat(self.date)
        if (self.lower is None) != (self.upper is None):
            raise ValueError("Both interval bounds required")
        if self.lower is not None and not self.lower <= self.value <= self.upper:
            raise ValueError("Invalid interval")
        return self


class ForecastResult(StrictModel):
    points: list[ForecastPoint] = Field(min_length=1, max_length=366)
    sampleCount: int = Field(ge=1)
    uncertainty: str | None = Field(default=None, max_length=1000)


class Citation(StrictModel):
    id: str
    quote: str = Field(min_length=1, max_length=10000)


class ReportSection(StrictModel):
    title: str = Field(min_length=1, max_length=300)
    text: str = Field(min_length=1, max_length=20000)
    evidenceIds: list[str] = Field(min_length=1, max_length=200)


class ReportResult(StrictModel):
    title: str = Field(min_length=1, max_length=300)
    summary: str = Field(min_length=1, max_length=20000)
    sections: list[ReportSection] = Field(min_length=1, max_length=30)
    evidence: list[Citation] = Field(min_length=1, max_length=200)


class AssistantResult(StrictModel):
    status: Literal["answered", "insufficient_evidence"] = "answered"
    answer: str | None = Field(default=None, min_length=1, max_length=20000)
    evidence: list[Citation] = Field(max_length=200)

    @model_validator(mode="after")
    def answer_state(self):
        if self.status == "insufficient_evidence":
            if self.answer is not None or self.evidence:
                raise ValueError("Abstention must not invent an answer or citations")
        elif not self.answer or not self.evidence:
            raise ValueError("Answered response requires text and citations")
        return self


class Question(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    type: Literal["short_text", "long_text", "single_choice", "multiple_choice", "rating", "nps"]
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    required: bool
    options: (
        list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]]
        | None
    ) = Field(
        default=None,
        min_length=2,
        max_length=30,
    )

    @model_validator(mode="after")
    def choices(self):
        if self.type in ("single_choice", "multiple_choice"):
            if not self.options or any(not value.strip() for value in self.options):
                raise ValueError("Choice questions require nonempty options")
            if len(set(self.options)) != len(self.options):
                raise ValueError("Duplicate options")
            if any(len(value) > 200 for value in self.options):
                raise ValueError("Choice option too long")
        elif self.options is not None:
            raise ValueError("Options only allowed for choices")
        return self


class SurveyResult(StrictModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
    questions: list[Question] = Field(min_length=5, max_length=10)


class SentenceLanguage(StrictModel):
    sentenceId: str
    language: Literal["ar", "en", "mixed", "und"]


class LanguageResult(StrictModel):
    language: Literal["ar", "en", "mixed", "und"]
    method: str
    sentences: list[SentenceLanguage] = Field(default_factory=list, max_length=MAX_SENTENCES)


class NormalizationResult(StrictModel):
    text: str
    normalizedText: str
    sentences: list[Sentence] = Field(max_length=MAX_SENTENCES)
    method: str


RESULT_MODELS = {
    "sentiment": SentimentResult,
    "aspects": AspectsResult,
    "embeddings": EmbeddingsResult,
    "clustering": ClusteringResult,
    "forecasting": ForecastResult,
    "report": ReportResult,
    "assistant": AssistantResult,
    "survey_generation": SurveyResult,
    "language": LanguageResult,
    "normalization": NormalizationResult,
}


def validate_result(capability, value, request, manifest=None):
    result = RESULT_MODELS[capability].model_validate(value)
    sources = {item.id: item.text for item in request.evidence}
    sentences = {item.id: item for item in request.sentences}
    if capability == "normalization":
        if result.text != request.text:
            raise ValueError("Normalization changed raw source")
        if len({item.id for item in result.sentences}) != len(result.sentences):
            raise ValueError("Duplicate normalization sentence IDs")
        if request.text.strip() and not result.normalizedText.strip():
            raise ValueError("Normalization removed all source text")
        for item in result.sentences:
            if request.text[item.start : item.end] != item.text:
                raise ValueError("Normalization sentence source mismatch")
        validate_sentence_coverage(request.text, result.sentences)
    if capability == "sentiment":
        ids = [item.sentenceId for item in result.sentences]
        if len(set(ids)) != len(ids) or set(ids) != set(sentences):
            raise ValueError("Sentiment must cover each source sentence exactly once")
    if capability == "language" and result.sentences:
        ids = [item.sentenceId for item in result.sentences]
        if len(set(ids)) != len(ids) or set(ids) != set(sentences):
            raise ValueError("Sentence language source coverage mismatch")
    if capability == "aspects":
        taxonomy = manifest.taxonomy if manifest else None
        if taxonomy is None or result.taxonomyVersion != taxonomy.version:
            raise ValueError("Taxonomy version mismatch")
        pairs = set()
        for mention in result.mentions:
            sentence = sentences.get(mention.sentenceId)
            pair = (mention.sentenceId, mention.aspect)
            if pair in pairs or mention.aspect not in taxonomy.labels or sentence is None:
                raise ValueError("Unknown or duplicate aspect/sentence")
            pairs.add(pair)
            if not sentence.start <= mention.start < mention.end <= sentence.end:
                raise ValueError("Aspect outside source sentence")
            if request.text[mention.start : mention.end] != mention.quote:
                raise ValueError("Aspect quotation mismatch")
    if capability in ("report", "assistant"):
        citations = {item.id for item in result.evidence}
        if len(citations) != len(result.evidence):
            raise ValueError("Duplicate citation")
        for item in result.evidence:
            if item.id not in sources or item.quote not in sources[item.id]:
                raise ValueError("Unverified evidence")
        if capability == "report":
            for section in result.sections:
                if not set(section.evidenceIds).issubset(citations):
                    raise ValueError("Uncited section")
    if capability == "embeddings":
        ids = [item.id for item in result.vectors]
        expected = set(sources) or {request.taskId}
        if len(set(ids)) != len(ids) or set(ids) != expected:
            raise ValueError("Embedding sources mismatch")
        if len({len(item.values) for item in result.vectors}) != 1:
            raise ValueError("Embedding dimensions mismatch")
    if capability == "clustering":
        seen = list(result.noiseIds)
        for cluster in result.clusters:
            if not set(cluster.evidenceIds).issubset(sources):
                raise ValueError("Unknown cluster evidence")
            if not set(cluster.evidenceIds).issubset(cluster.memberIds):
                raise ValueError("Cluster evidence outside members")
            seen.extend(cluster.memberIds)
        if len(seen) != len(set(seen)) or set(seen) != set(sources):
            raise ValueError("Clustering must partition input sources")
    if capability == "forecasting":
        if result.sampleCount != len(request.parameters.get("observations", [])):
            raise ValueError("Forecast observation count mismatch")
        dates = [point.date for point in result.points]
        if dates != sorted(set(dates)):
            raise ValueError("Forecast dates must be unique and ordered")
    if capability == "survey_generation":
        if len({item.id for item in result.questions}) != len(result.questions):
            raise ValueError("Duplicate question ID")
    # Reject nonfinite JSON even for strings accidentally converted by an adapter.
    output = result.model_dump(exclude_none=True)
    if capability == "assistant" and result.status == "insufficient_evidence":
        output["answer"] = None
    if capability == "survey_generation":
        for question in output["questions"]:
            try:
                parsed = UUID(question["id"])
                if parsed.variant != RFC_4122 or parsed.version not in range(1, 9):
                    raise ValueError("Non-publishable UUID")
                question["id"] = str(parsed)
            except ValueError:
                question["id"] = str(
                    uuid5(NAMESPACE_URL, f"nuvia-survey:{request.taskId}:{question['id']}")
                )
        if len({item["id"] for item in output["questions"]}) != len(output["questions"]):
            raise ValueError("Duplicate canonical question UUID")
    json.dumps(output, allow_nan=False)
    return output
